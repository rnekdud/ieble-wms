using System.Data;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using IebleWms.Api.Warehousing;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Reports;

// Read-only operational projection. All counts come from the shared stock ledger.
public sealed partial class WarehouseDashboardService(WmsDbContext db, TimeProvider clock,
    WarehousePlanService plans, StockOverviewService stock)
{
    sealed class Cell
    {
        public Guid WarehouseId { get; set; }
        public Guid? RackId { get; set; }
        public Guid LocationId { get; set; }
        public Guid ProductId { get; set; }
        public decimal Quantity { get; set; }
        public decimal Reserved { get; set; }
        public string Unit { get; set; } = "";
    }
    IQueryable<Cell> Cells(Guid tenant) =>
        from s in db.StockBalances.AsNoTracking() where s.TenantId == tenant
        join l in db.StorageLocations on new { s.TenantId, s.WarehouseId, Id = s.LocationId }
            equals new { l.TenantId, l.WarehouseId, l.Id }
        select new Cell { WarehouseId = s.WarehouseId, RackId = l.RackId, LocationId = l.Id,
            ProductId = s.ProductId, Quantity = s.Quantity, Reserved = s.ReservedQuantity, Unit = s.Unit };

    public sealed class Summary
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public int Products { get; set; }
        public int HoldingRacks { get; set; }
        public int Locations { get; set; }
        public int HoldingLocations { get; set; }
        public int ReservedLocations { get; set; }
    }
    IQueryable<Summary> Summaries(Guid tenant)
    {
        var cells = Cells(tenant);
        return db.Warehouses.AsNoTracking().Where(w => w.TenantId == tenant && w.IsActive)
            .Select(w => new Summary { Id = w.Id, Code = w.Code, Name = w.Name,
                Products = cells.Where(s => s.WarehouseId == w.Id && s.Quantity > 0).Select(s => s.ProductId).Distinct().Count(),
                HoldingRacks = cells.Where(s => s.WarehouseId == w.Id && s.Quantity > 0 && s.RackId != null).Select(s => s.RackId).Distinct().Count(),
                Locations = db.StorageLocations.Count(l => l.TenantId == tenant && l.WarehouseId == w.Id),
                HoldingLocations = cells.Where(s => s.WarehouseId == w.Id && s.Quantity > 0).Select(s => s.LocationId).Distinct().Count(),
                ReservedLocations = cells.Where(s => s.WarehouseId == w.Id && s.Reserved > 0).Select(s => s.LocationId).Distinct().Count() });
    }
    public async Task<object> Warehouses(Guid tenant, CancellationToken ct, bool compact = false)
    {
        if (compact) return new { asOf = clock.GetUtcNow(), warehouses = await db.Warehouses.AsNoTracking().Where(w => w.TenantId == tenant && w.IsActive).OrderBy(w => w.Code).ThenBy(w => w.Id).Select(w => new { w.Id, w.Code, w.Name }).ToListAsync(ct) };
        return new { asOf = clock.GetUtcNow(), warehouses = await Summaries(tenant).OrderBy(x => x.Code).ThenBy(x => x.Id).ToListAsync(ct) };
    }

    public async Task<object> Read(Guid tenant, Guid warehouse, Guid? rackId, Guid? locationId, int page, CancellationToken ct, IReadOnlyDictionary<string, string[]>? grants = null, int riskPage = 1, int expiryPage = 1, string? riskKind = null, int alertPage = 1)
    {
        if (page < 1 || page > 100000 || (locationId.HasValue && !rackId.HasValue))
            throw new OrganizationException(400, "조회 위치와 페이지를 확인해 주세요.");
        await using var tx = await db.Database.BeginTransactionAsync(db.Database.IsNpgsql() ? IsolationLevel.RepeatableRead : IsolationLevel.Serializable, ct);
        if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", ct);
        var summary = await Summaries(tenant).SingleOrDefaultAsync(w => w.Id == warehouse, ct)
            ?? throw new OrganizationException(404, "현재 기업의 활성 창고를 찾을 수 없습니다.");
        var cells = Cells(tenant).Where(s => s.WarehouseId == warehouse);
        var racks = await db.WarehouseRacks.AsNoTracking().Where(r => r.TenantId == tenant && r.WarehouseId == warehouse)
            .OrderBy(r => r.Code).ThenBy(r => r.Id).Select(r => new {
                r.Id, r.Code, r.Name, r.IsActive, r.Levels, r.Bays,
                needsReview = !r.IsActive || db.StorageLocations.Any(l => l.TenantId == tenant && l.WarehouseId == warehouse && l.RackId == r.Id && !l.IsActive && db.StockBalances.Any(s => s.TenantId == tenant && s.LocationId == l.Id && s.Quantity > 0)) || (r.ZoneId != null && !db.WarehouseZones.Any(z => z.TenantId == tenant && z.Id == r.ZoneId && z.IsActive)),
                locations = db.StorageLocations.Count(l => l.TenantId == tenant && l.WarehouseId == warehouse && l.RackId == r.Id),
                products = cells.Where(s => s.RackId == r.Id && s.Quantity > 0).Select(s => s.ProductId).Distinct().Count(),
                holdingLocations = cells.Where(s => s.RackId == r.Id && s.Quantity > 0).Select(s => s.LocationId).Distinct().Count(),
                reservedLocations = cells.Where(s => s.RackId == r.Id && s.Reserved > 0).Select(s => s.LocationId).Distinct().Count()
            }).ToListAsync(ct);
        var pg = db.Database.IsNpgsql();
        var totals = await cells.GroupBy(s => s.Unit).Select(g => new {
            unit = g.Key,
            quantity = pg ? g.Sum(s => s.Quantity) : (decimal)Math.Round(g.Sum(s => (double)s.Quantity), 3),
            reservedQuantity = pg ? g.Sum(s => s.Reserved) : (decimal)Math.Round(g.Sum(s => (double)s.Reserved), 3),
            availableQuantity = pg ? g.Sum(s => s.Quantity - s.Reserved) : (decimal)Math.Round(g.Sum(s => (double)(s.Quantity - s.Reserved)), 3)
        }).OrderBy(x => x.unit).ToListAsync(ct);
        var rackTotals = await cells.Where(s => s.RackId != null).GroupBy(s => new { s.RackId, s.Unit }).Select(g => new {
            rackId = g.Key.RackId, unit = g.Key.Unit,
            quantity = pg ? g.Sum(s => s.Quantity) : (decimal)Math.Round(g.Sum(s => (double)s.Quantity), 3)
        }).OrderBy(x => x.unit).ToListAsync(ct);
        Guid[] detailProducts = [];
        var plan = await plans.Read(tenant, warehouse, ct);
        object? detail = null;
        if (rackId.HasValue)
        {
            await plans.RequireRackLocation(tenant, warehouse, rackId.Value, locationId, ct);
            var front = await plans.Rack(tenant, warehouse, rackId.Value, ct, true);
            var locations = await cells.Where(s => s.RackId == rackId).GroupBy(s => s.LocationId)
                .Select(g => new { id = g.Key, products = g.Where(s => s.Quantity > 0).Select(s => s.ProductId).Distinct().Count(), reserved = g.Any(s => s.Reserved > 0) }).ToListAsync(ct);
            var rows = stock.Rows(tenant, new StockOverviewQuery { View = "location", WarehouseId = warehouse, RackId = rackId, LocationId = locationId })
                .Where(s => s.Quantity > 0 || s.ReservedQuantity > 0);
            var total = await rows.CountAsync(ct);
            var items = await rows.OrderBy(s => s.LocationCode).ThenBy(s => s.ProductCode).ThenBy(s => s.ProductId)
                .ThenBy(s => s.Unit).ThenBy(s => s.LotNumber).ThenBy(s => s.ExpiryDate).ThenBy(s => s.SerialNumber)
                .Skip((page - 1) * 20).Take(20).ToListAsync(ct);
            detailProducts = items.Select(x => x.ProductId).Distinct().ToArray();
            detail = new { front, locations, stock = new { items, total, page, pageSize = 20, locationId } };
        }
        var risk = await Risk(tenant, warehouse, racks.Select(r => new RiskRack(r.Id, r.needsReview)).ToArray(), rackId, riskPage, expiryPage, grants, ct, detailProducts, riskKind, alertPage);
        await tx.CommitAsync(ct);
        return new { asOf = clock.GetUtcNow(), warehouse = summary, plan, racks, totals, rackTotals, detail, risk };
    }
}
