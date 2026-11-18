using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Inventory;

public sealed partial class InventoryService
{
    // Read-only cascading choices. Guid.Empty represents existing locations without a rack;
    // it is never persisted as a RackId or used to create physical locations.
    async Task<object> MoveChoices(Guid tenant, string kind, string? search, Guid? productId,
        Guid? warehouseId, Guid? rackId, Guid? locationId, int page, CancellationToken ct)
    {
        Page(page, 20);
        if (search?.Length > 100) throw Error("검색어는 100자까지 입력해 주세요.");
        var term = search?.Trim().ToLowerInvariant() ?? "";
        var locations = ActiveLocations(tenant);
        var stocks = db.StockBalances.Where(s => s.TenantId == tenant && s.Quantity > 0 &&
            db.Products.Any(p => p.TenantId == tenant && p.Id == s.ProductId && p.IsActive) &&
            locations.Any(l => l.Id == s.LocationId && l.WarehouseId == s.WarehouseId));
        var productStocks = stocks.Where(s => s.ProductId == productId);
        var source = kind.StartsWith("move-source-", StringComparison.Ordinal);
        var eligibleLocations = source
            ? locations.Where(l => productStocks.Any(s => s.LocationId == l.Id && s.WarehouseId == l.WarehouseId))
            : locations;
        var warehouseLocations = eligibleLocations.Where(l => l.WarehouseId == warehouseId);
        IQueryable<MoveChoice> q;
        switch (kind)
        {
            case "move-products":
                q = db.Products.Where(p => p.TenantId == tenant && p.IsActive && stocks.Any(s => s.ProductId == p.Id) &&
                    (term == "" || p.Code.ToLower().Contains(term) || p.Name.ToLower().Contains(term) ||
                     db.StorageBarcodes.Any(b => b.TenantId == tenant && b.ProductId == p.Id && b.Value.ToLower().Contains(term))))
                    .Select(p => new MoveChoice { Id = p.Id, Code = p.Code, Name = p.Name, Unit = p.Unit });
                break;
            case "move-source-warehouses":
            case "move-warehouses":
                q = db.Warehouses.Where(w => w.TenantId == tenant && w.IsActive &&
                    (!source || eligibleLocations.Any(l => l.WarehouseId == w.Id)))
                    .Select(w => new MoveChoice { Id = w.Id, Code = w.Code, Name = w.Name });
                break;
            case "move-source-racks":
            case "move-racks":
                q = db.WarehouseRacks.Where(r => r.TenantId == tenant && r.WarehouseId == warehouseId && r.IsActive &&
                    warehouseLocations.Any(l => l.RackId == r.Id))
                    .Select(r => new MoveChoice { Id = r.Id, Code = r.Code, Name = r.Name })
                    .Concat(db.Warehouses.Where(w => w.TenantId == tenant && w.Id == warehouseId && w.IsActive &&
                        warehouseLocations.Any(l => l.RackId == null))
                        .Select(w => new MoveChoice { Id = Guid.Empty, Code = "바닥", Name = "랙 없는 보관 위치" }));
                break;
            case "move-source-locations":
            case "move-locations":
                q = warehouseLocations.Where(l => rackId.HasValue && (rackId == Guid.Empty ? l.RackId == null : l.RackId == rackId) &&
                    (term == "" || l.Code.ToLower().Contains(term) || l.Name.ToLower().Contains(term) ||
                     db.StorageBarcodes.Any(b => b.TenantId == tenant && b.LocationId == l.Id && b.Value.ToLower().Contains(term))))
                    .Select(l => new MoveChoice { Id = l.Id, Code = l.Code, Name = l.Name, Level = l.Level, Bay = l.Bay,
                        Barcode = db.StorageBarcodes.Where(b => b.TenantId == tenant && b.LocationId == l.Id).Select(b => b.Value).FirstOrDefault() });
                break;
            case "move-stocks":
                q = productStocks.Where(s => s.WarehouseId == warehouseId && s.LocationId == locationId &&
                    (term == "" || (s.LotNumber != null && s.LotNumber.ToLower().Contains(term)) ||
                     (s.SerialNumber != null && s.SerialNumber.ToLower().Contains(term)) || s.Id.ToString().Contains(term)))
                    .Select(s => new MoveChoice { Id = s.Id, Code = s.Id.ToString(), Name = "LOT " + (s.LotNumber ?? "없음") + " · 시리얼 " + (s.SerialNumber ?? "없음"),
                        Unit = s.Unit, ExpiryDate = s.ExpiryDate, Quantity = s.Quantity, ReservedQuantity = s.ReservedQuantity,
                        AvailableQuantity = s.Quantity - s.ReservedQuantity });
                break;
            default: throw Error("선택 항목을 확인해 주세요.");
        }
        if (term != "" && kind is not ("move-products" or "move-locations" or "move-source-locations" or "move-stocks"))
            q = q.Where(x => x.Code.ToLower().Contains(term) || x.Name.ToLower().Contains(term));
        var total = await q.CountAsync(ct);
        return new { items = await q.OrderBy(x => x.Code).ThenBy(x => x.Id).Skip((page - 1) * 30).Take(30).ToListAsync(ct), total, page, pageSize = 30 };
    }

    sealed class MoveChoice
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Unit { get; set; }
        public string? Barcode { get; set; }
        public int? Level { get; set; }
        public int? Bay { get; set; }
        public DateOnly? ExpiryDate { get; set; }
        public decimal? Quantity { get; set; }
        public decimal? ReservedQuantity { get; set; }
        public decimal? AvailableQuantity { get; set; }
    }
}
