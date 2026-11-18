using System.Data;
using IebleWms.Api.Contracts;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Reports;

public sealed partial class WarehouseDashboardService
{
    sealed record RiskRack(Guid Id, bool NeedsReview);
    sealed record RiskProduct(Guid ProductId, string ProductCode, string ProductName, string Unit,
        string Status, decimal CurrentQuantity, decimal ReservedQuantity, decimal ExpectedQuantity,
        decimal? SafetyStock, decimal? ShortageQuantity, decimal RackQuantity, decimal RackReservedQuantity,
        string[] Reasons, string InventoryStatus, string[] InventoryReasons, DateOnly? EarliestExpiry, object[] Reservations, int MoreReservationDates);

    // Called inside the existing warehouse RepeatableRead transaction. Bounded grouped queries, no per-rack reads.
    async Task<object> Risk(Guid tenant, Guid warehouse, RiskRack[] racks, Guid? selectedRack, int riskPage, int expiryPage,
        IReadOnlyDictionary<string, string[]>? grants, CancellationToken ct, Guid[] detailProducts, string? riskKind, int alertPage)
    {
        if ((riskKind is not null and not "shortage" and not "expiry") || alertPage < 1 || alertPage > 100000 || riskPage < 1 || riskPage > 100000 || expiryPage < 1 || expiryPage > 100000)
            throw new OrganizationException(400, "위험 정보 조회 페이지를 확인해 주세요.");
        bool Allowed(string feature) => grants is null || DashboardService.CanRead(grants, feature);
        var canReceipts = Allowed("receipts"); var canShipments = Allowed("shipments");
        var today = stock.Today; var soon = today.AddDays(InventoryRiskPolicy.ExpirySoonDays); var pg = db.Database.IsNpgsql();
        var cells = stock.Rows(tenant, new StockOverviewQuery { View = "location", WarehouseId = warehouse })
            .Where(s => s.Quantity > 0 && s.RackId != null);
        var grouped = await cells.GroupBy(s => new { s.RackId, s.ProductId, s.ProductCode, s.ProductName, s.Unit, s.SafetyStock, s.SafetyComparable, s.IsActive })
            .Select(g => new { g.Key, Quantity = pg ? g.Sum(s => s.Quantity) : (decimal)Math.Round(g.Sum(s => (double)s.Quantity), 3),
                Reserved = pg ? g.Sum(s => s.ReservedQuantity) : (decimal)Math.Round(g.Sum(s => (double)s.ReservedQuantity), 3),
                Expiry = g.Min(s => s.ExpiryDate) }).ToListAsync(ct);
        var products = grouped.Select(s => s.Key.ProductId).Distinct().ToArray();
        var global = await stock.Rows(tenant, new StockOverviewQuery()).Where(s => products.Contains(s.ProductId)).ToListAsync(ct);
        var totals = global.ToDictionary(s => (s.ProductId, s.Unit));
        var allocations = from a in db.ShipmentAllocations.AsNoTracking()
            where a.TenantId == tenant && a.State == "Active" && a.Quantity > 0
            join line in db.OutboundShipmentLines on new { a.TenantId, Id = a.LineId } equals new { line.TenantId, line.Id }
            join doc in DashboardQueries.OpenShipments(db, tenant) on new { line.TenantId, Id = line.ShipmentId } equals new { doc.TenantId, doc.Id }
            join balance in db.StockBalances on new { a.TenantId, Id = a.StockId } equals new { balance.TenantId, balance.Id }
            where products.Contains(balance.ProductId)
            select new { balance.ProductId, balance.Unit, doc.ExpectedDate, a.Quantity };
        var scheduled = await allocations.GroupBy(x => new { x.ProductId, x.Unit, x.ExpectedDate })
            .Select(g => new { g.Key, Quantity = pg ? g.Sum(x => x.Quantity) : (decimal)Math.Round(g.Sum(x => (double)x.Quantity), 3) }).ToListAsync(ct);
        var reservationGroups = scheduled.ToLookup(x => (x.Key.ProductId, x.Key.Unit));
        var issues = grouped.Select(row => {
            var total = totals[(row.Key.ProductId, row.Key.Unit)];
            var dates = reservationGroups[(row.Key.ProductId, row.Key.Unit)].OrderBy(x => x.Key.ExpectedDate).ToArray();
            var comparable = row.Key.SafetyComparable; var reasons = new List<string>();
            var stockState = InventoryRiskPolicy.Stock(total.AvailableQuantity, row.Key.SafetyStock, comparable);
            var expiryState = InventoryRiskPolicy.Expiry(row.Expiry, today);
            if (!comparable) reasons.Add("기준 단위 불일치 · 안전재고 비교 제외");
            else if (row.Key.SafetyStock is null) reasons.Add("안전재고 미설정 · 부족 위험 판단 제외");
            else if (stockState == "danger") reasons.Add(total.ReservedQuantity > 0 ? "출고 예약 반영 후 상품 전체 안전재고 미달 예상" : "상품 전체 현재 재고가 안전재고 미만");
            else if (stockState == "warning") reasons.Add("출고 예약 반영 후 안전재고의 10% 이내");
            var mismatch = dates.Sum(x => x.Quantity) != total.ReservedQuantity;
            if (mismatch) reasons.Add("재고 예약량과 활성 출고 배정량 불일치 · 확인 필요");
            if (!row.Key.IsActive) reasons.Add("사용 중지된 상품의 재고 · 확인 필요");
            var inventoryStatus = InventoryRiskPolicy.Highest([stockState, mismatch || !row.Key.IsActive ? "review" : "safe"]);
            var inventoryReasons = reasons.ToArray();
            if (expiryState != "safe") reasons.Add(row.Expiry < today ? "유통기한 경과 재고 있음" : row.Expiry == today ? "오늘 유통기한 만료" : $"유통기한 {row.Expiry!.Value.DayNumber - today.DayNumber}일 남음");
            var status = InventoryRiskPolicy.Highest([stockState, expiryState, mismatch || !row.Key.IsActive ? "review" : "safe"]);
            return (RackId: row.Key.RackId!.Value, Product: new RiskProduct(row.Key.ProductId, row.Key.ProductCode, row.Key.ProductName, row.Key.Unit,
                status, total.Quantity, total.ReservedQuantity, total.AvailableQuantity, row.Key.SafetyStock,
                comparable && row.Key.SafetyStock > 0 ? Math.Max(0, row.Key.SafetyStock.Value - total.AvailableQuantity) : null,
                row.Quantity, row.Reserved, reasons.ToArray(), inventoryStatus, inventoryReasons, row.Expiry,
                canShipments ? dates.Take(3).Select(x => (object)new { date = x.Key.ExpectedDate, quantity = x.Quantity }).ToArray() : [],
                canShipments ? Math.Max(0, dates.Length - 3) : 0));
        }).ToLookup(x => x.RackId, x => x.Product);
        var states = racks.Select(r => {
            var items = issues[r.Id].Where(p => p.Status != "safe").OrderByDescending(p => InventoryRiskPolicy.Priority(p.Status)).ThenBy(p => p.ProductCode).ThenBy(p => p.ProductId).ThenBy(p => p.Unit).ToArray();
            var statuses = issues[r.Id].Select(p => p.Status).Concat(r.NeedsReview ? ["review"] : Array.Empty<string>());
            return new { id = r.Id, status = InventoryRiskPolicy.Highest(statuses), needsReview = r.NeedsReview,
                issueCount = items.Length, preview = items.Take(3).ToArray(),
                hoverGroups = new[] { "danger", "warning" }.Select(state => {
                    // One name per product, using its highest existing status across units/LOTs.
                    var unique = items.DistinctBy(p => p.ProductId).Where(p => p.Status == state).ToArray();
                    return new { status = state, total = unique.Length,
                        products = unique.Take(3).Select(p => new { p.ProductId, p.ProductName }).ToArray() };
                }).ToArray() };
        }).ToArray();
        var lowIds = issues.SelectMany(g => g).Where(p => p.ShortageQuantity > 0).Select(p => p.ProductId).Distinct().ToArray();
        var expiringCells = cells.Where(x => x.ExpiryDate != null && x.ExpiryDate <= soon);
        var expiryProducts = await expiringCells.Select(x => x.ProductId).Distinct().CountAsync(ct);
        object? alerts = null;
        if (riskKind is not null) {
            // Use the same product-wide policy as rack risk; never compare a location's quantity with product safety stock.
            var rows = riskKind == "expiry" ? expiringCells : cells.Where(x => lowIds.Contains(x.ProductId) && x.SafetyComparable && x.SafetyStock > 0 && x.IsLow);
            var total = await rows.CountAsync(ct);
            var items = await rows.OrderBy(x => x.ExpiryDate).ThenBy(x => x.ProductCode).ThenBy(x => x.LocationId).ThenBy(x => x.Unit).ThenBy(x => x.LotNumber).ThenBy(x => x.SerialNumber)
                .Skip((alertPage - 1) * 20).Take(20).ToListAsync(ct);
            alerts = new { kind = riskKind, page = alertPage, pageSize = 20, total,
                items = items.Select(x => new { stock = x, risk = issues[x.RackId!.Value].First(p => p.ProductId == x.ProductId && p.Unit == x.Unit),
                    remainingDays = x.ExpiryDate.HasValue ? (int?)(x.ExpiryDate.Value.DayNumber - today.DayNumber) : null,
                    expiryStatus = InventoryRiskPolicy.Expiry(x.ExpiryDate, today) }) };
        }
        object? detail = null;
        if (selectedRack.HasValue) {
            var all = issues[selectedRack.Value].Where(p => p.Status != "safe").OrderByDescending(p => InventoryRiskPolicy.Priority(p.Status)).ThenBy(p => p.ProductCode).ThenBy(p => p.ProductId).ThenBy(p => p.Unit).ToArray();
            var expiring = cells.Where(x => x.RackId == selectedRack && x.ExpiryDate != null && x.ExpiryDate <= soon);
            var expiryTotal = await expiring.CountAsync(ct);
            var expiryItems = await expiring.OrderBy(x => x.ExpiryDate).ThenBy(x => x.ProductCode).ThenBy(x => x.LocationId).ThenBy(x => x.LotNumber).ThenBy(x => x.SerialNumber)
                .Skip((expiryPage - 1) * 20).Take(20).ToListAsync(ct);
            detail = new { rackId = selectedRack, stockProducts = issues[selectedRack.Value].Where(p => detailProducts.Contains(p.ProductId)).ToArray(), items = all.Skip((riskPage - 1) * 20).Take(20), total = all.Length, page = riskPage, pageSize = 20,
                expiry = new { items = expiryItems.Select(x => new { x.ProductId, x.ProductCode, x.ProductName, x.LocationId, x.LocationCode, x.LotNumber, x.SerialNumber, x.ExpiryDate, x.Quantity, x.Unit,
                    remainingDays = x.ExpiryDate!.Value.DayNumber - today.DayNumber, status = InventoryRiskPolicy.Expiry(x.ExpiryDate, today) }), total = expiryTotal, page = expiryPage, pageSize = 20 } };
        }
        return new { today, expirySoonDays = InventoryRiskPolicy.ExpirySoonDays, nearSafetyRatio = InventoryRiskPolicy.NearSafetyRatio,
            access = new { receipts = canReceipts, shipments = canShipments },
            todayReceipts = canReceipts ? (int?)await DashboardQueries.OpenReceipts(db, tenant).CountAsync(x => x.WarehouseId == warehouse && x.ExpectedDate == today, ct) : null,
            todayShipments = canShipments ? (int?)await DashboardQueries.OpenShipments(db, tenant).CountAsync(x => x.WarehouseId == warehouse && x.ExpectedDate == today, ct) : null,
            counts = new { safe = states.Count(x => x.status == "safe"), warning = states.Count(x => x.status == "warning"), danger = states.Count(x => x.status == "danger"), review = states.Count(x => x.status == "review"), empty = states.Count(x => x.status == "empty") },
            lowProducts = lowIds.Length, expiryProducts, alerts, racks = states, detail };
    }
    public async Task<object> Scheduled(Guid tenant, Guid warehouse, bool outbound, int page, CancellationToken ct)
    {
        if (page < 1 || page > 100000) throw new OrganizationException(400, "조회 페이지를 확인해 주세요.");
        await using var tx = await db.Database.BeginTransactionAsync(db.Database.IsNpgsql() ? IsolationLevel.RepeatableRead : IsolationLevel.Serializable, ct);
        if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", ct);
        if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenant && x.Id == warehouse && x.IsActive, ct)) throw new OrganizationException(404, "현재 기업의 활성 창고를 찾을 수 없습니다.");
        var today = stock.Today;
        var docs = outbound ? DashboardQueries.OpenShipments(db, tenant).Where(x => x.WarehouseId == warehouse && x.ExpectedDate == today).Select(x => new { x.Id, x.Number, x.PartnerName, x.ExpectedDate, x.Status })
            : DashboardQueries.OpenReceipts(db, tenant).Where(x => x.WarehouseId == warehouse && x.ExpectedDate == today).Select(x => new { x.Id, x.Number, x.PartnerName, x.ExpectedDate, x.Status });
        var total = await docs.CountAsync(ct); var documents = await docs.OrderBy(x => x.Number).ThenBy(x => x.Id).Skip((page - 1) * 10).Take(10).ToListAsync(ct);
        var ids = documents.Select(x => x.Id).ToArray();
        var lines = outbound ? db.OutboundShipmentLines.AsNoTracking().Where(x => x.TenantId == tenant && ids.Contains(x.ShipmentId)).Select(x => new { documentId = x.ShipmentId, x.Id, x.Position, x.ProductId, x.ProductCode, x.ProductName, quantity = x.RequestedQuantity, x.Unit })
            : db.InboundReceiptLines.AsNoTracking().Where(x => x.TenantId == tenant && ids.Contains(x.ReceiptId)).Select(x => new { documentId = x.ReceiptId, x.Id, x.Position, x.ProductId, x.ProductCode, x.ProductName, quantity = x.ExpectedQuantity, x.Unit });
        var items = await lines.OrderBy(x => x.Position).ThenBy(x => x.Id).ToListAsync(ct); var lookup = items.ToLookup(x => x.documentId);
        await tx.CommitAsync(ct);
        return new { asOf = clock.GetUtcNow(), today, total, page, pageSize = 10, documents = documents.Select(x => new { x.Id, x.Number, x.PartnerName, x.ExpectedDate, x.Status, lines = lookup[x.Id] }) };
    }
}
