using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Products;

public sealed class ProductSelectionQuery
{
    public Guid? RackId { get; set; }
    public bool StockOnly { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? ProductTypeId { get; set; }
    public Guid? ShipmentId { get; set; }
    public Guid[]? Ids { get; set; }
    public int PageSize { get; set; } = 20;
}

// Read-only projection for both document editors. It exposes no cost or other product-admin fields.
public static class DocumentProductSelection
{
    public static async Task<object> Options(WmsDbContext db, Guid tenant, CancellationToken ct) => new {
        categories = await db.ProductCategories.AsNoTracking().Where(x => x.TenantId == tenant).OrderBy(x => x.NormalizedName).Select(x => new { x.Id, x.Name, x.ParentId, x.IsActive }).ToListAsync(ct),
        productTypes = await db.ProductTypes.AsNoTracking().Where(x => x.TenantId == tenant).OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.IsActive }).ToListAsync(ct)
    };

    public static async Task<object> List(WmsDbContext db, Guid tenant, string? search, int page,
        ProductSelectionQuery query, Guid? warehouseId, IQueryable<StorageLocation>? activeLocations, CancellationToken ct)
    {
        if (search?.Length > 100 || page is < 1 or > 100000 || query.PageSize is not (20 or 50 or 100) || query.Ids?.Length > 100)
            throw new OrganizationException(400, "상품 검색·페이지 조건을 확인해 주세요.");
        var shipping = activeLocations != null;
        if (shipping && (!warehouseId.HasValue || !await db.Warehouses.AnyAsync(w => w.TenantId == tenant && w.Id == warehouseId && w.IsActive, ct)))
            throw new OrganizationException(400, "사용 가능한 출고 창고를 먼저 선택해 주세요.");
        if (shipping && query.RackId.HasValue) {
            if (!await db.WarehouseRacks.AnyAsync(r => r.TenantId == tenant && r.WarehouseId == warehouseId && r.Id == query.RackId && r.IsActive, ct))
                throw new OrganizationException(400, "현재 출고 창고의 랙을 선택해 주세요.");
            activeLocations = activeLocations!.Where(l => l.RackId == query.RackId);
        }
        OutboundShipment? editing = null;
        if (shipping && query.ShipmentId.HasValue)
        {
            editing = await db.OutboundShipments.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == query.ShipmentId, ct)
                ?? throw new OrganizationException(404, "출고 문서를 찾을 수 없습니다.");
            if (editing.Status != "Requested") throw new OrganizationException(409, "출고 상태가 변경되었습니다. 상세를 다시 열어 주세요.");
        }
        var products = db.Products.AsNoTracking().Where(p => p.TenantId == tenant && p.IsActive);
        var term = search?.Trim().ToLowerInvariant() ?? "";
        if (term != "") products = products.Where(p => p.Code.ToLower().Contains(term) || p.Name.ToLower().Contains(term) ||
            (p.ModelNumber != null && p.ModelNumber.ToLower().Contains(term)) ||
            db.StorageBarcodes.Any(b => b.TenantId == tenant && b.ProductId == p.Id && b.Value.ToLower().Contains(term)));
        if (query.ProductTypeId.HasValue) products = products.Where(p => p.ProductTypeId == query.ProductTypeId);
        if (query.CategoryId.HasValue)
        {
            var categories = await db.ProductCategories.AsNoTracking().Where(x => x.TenantId == tenant).Select(x => new { x.Id, x.ParentId }).ToListAsync(ct);
            var ids = new HashSet<Guid> { query.CategoryId.Value };
            for (var i = 0; i < 2; i++) foreach (var c in categories.Where(c => c.ParentId.HasValue && ids.Contains(c.ParentId.Value)).ToArray()) ids.Add(c.Id);
            products = products.Where(p => p.CategoryId.HasValue && ids.Contains(p.CategoryId.Value));
        }
        if (query.Ids != null) products = products.Where(p => query.Ids.Contains(p.Id));
        if (shipping && query.StockOnly) products = products.Where(p => db.StockBalances.Any(s => s.TenantId == tenant && s.WarehouseId == warehouseId && s.ProductId == p.Id && s.Unit == p.Unit && s.Quantity > 0 && activeLocations!.Any(l => l.Id == s.LocationId)));
        var total = await products.CountAsync(ct);
        var items = await products.OrderBy(p => p.NormalizedCode).ThenBy(p => p.Id).Skip((page - 1) * query.PageSize).Take(query.PageSize)
            .Select(p => new SelectionProduct {
                Id = p.Id, Code = p.Code, Name = p.Name, Unit = p.Unit, ModelNumber = p.ModelNumber,
                RetailPrice = p.RetailPrice, Currency = p.Currency,
                LotManaged = p.LotManaged, ExpiryManaged = p.ExpiryManaged, SerialManaged = p.SerialManaged,
                ProductTypeName = db.ProductTypes.Where(t => t.TenantId == tenant && t.Id == p.ProductTypeId).Select(t => t.Name).FirstOrDefault(),
                HasImage = db.ProductImages.Any(i => i.TenantId == tenant && i.ProductId == p.Id),
                Barcode = db.StorageBarcodes.Where(b => b.TenantId == tenant && b.ProductId == p.Id).OrderByDescending(b => b.IsPrimary).ThenBy(b => b.Id).Select(b => b.Value).FirstOrDefault()
            }).ToListAsync(ct);
        if (shipping)
        {
            var ids = items.Select(p => p.Id).ToArray();
            // Same active-location and base-unit eligibility as final automatic reservation.
            var stocks = db.StockBalances.AsNoTracking().Where(s => s.TenantId == tenant && s.WarehouseId == warehouseId && ids.Contains(s.ProductId) &&
                activeLocations!.Any(l => l.Id == s.LocationId) && db.Products.Any(p => p.TenantId == tenant && p.Id == s.ProductId && p.Unit == s.Unit));
            var totals = db.Database.IsNpgsql()
                ? await stocks.GroupBy(s => s.ProductId).Select(g => new Totals { ProductId = g.Key, Physical = g.Sum(s => s.Quantity), Reserved = g.Sum(s => s.ReservedQuantity) }).ToListAsync(ct)
                : await stocks.GroupBy(s => s.ProductId).Select(g => new Totals { ProductId = g.Key, Physical = (decimal)g.Sum(s => (double)s.Quantity), Reserved = (decimal)g.Sum(s => (double)s.ReservedQuantity) }).ToListAsync(ct);
            var own = from a in db.ShipmentAllocations.AsNoTracking()
                      join line in db.OutboundShipmentLines on new { a.TenantId, Id = a.LineId } equals new { line.TenantId, line.Id }
                      join stock in stocks on new { a.TenantId, Id = a.StockId } equals new { stock.TenantId, stock.Id }
                      where a.TenantId == tenant && a.State == "Active" && line.ShipmentId == query.ShipmentId
                      select new { stock.ProductId, a.Quantity };
            var ownTotals = editing?.WarehouseId == warehouseId
                ? db.Database.IsNpgsql()
                    ? await own.GroupBy(s => s.ProductId).Select(g => new Totals { ProductId = g.Key, Reserved = g.Sum(s => s.Quantity) }).ToListAsync(ct)
                    : await own.GroupBy(s => s.ProductId).Select(g => new Totals { ProductId = g.Key, Reserved = (decimal)g.Sum(s => (double)s.Quantity) }).ToListAsync(ct)
                : [];
            foreach (var item in items)
            {
                var sum = totals.SingleOrDefault(x => x.ProductId == item.Id);
                item.Physical = decimal.Round(sum?.Physical ?? 0, 3); item.Reserved = decimal.Round(sum?.Reserved ?? 0, 3);
                item.Available = item.Physical - item.Reserved;
                item.OwnReserved = decimal.Round(ownTotals.SingleOrDefault(x => x.ProductId == item.Id)?.Reserved ?? 0, 3);
                item.Requestable = item.Available + item.OwnReserved;
            }
        }
        return new { items, total, page, pageSize = query.PageSize, asOf = DateTimeOffset.UtcNow };
    }
    sealed class Totals { public Guid ProductId { get; set; } public decimal Physical { get; set; } public decimal Reserved { get; set; } }
    public sealed class SelectionProduct
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string Unit { get; set; } = "";
        public string? ModelNumber { get; set; }
        public decimal? RetailPrice { get; set; }
        public string? Currency { get; set; }
        public string? ProductTypeName { get; set; }
        public string? Barcode { get; set; }
        public bool HasImage { get; set; }
        public bool LotManaged { get; set; }
        public bool ExpiryManaged { get; set; }
        public bool SerialManaged { get; set; }
        public decimal? Physical { get; set; }
        public decimal? Reserved { get; set; }
        public decimal? Available { get; set; }
        public decimal? OwnReserved { get; set; }
        public decimal? Requestable { get; set; }
    }
}
