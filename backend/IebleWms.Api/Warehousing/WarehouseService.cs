using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;

namespace IebleWms.Api.Warehousing;

public sealed class WarehouseService(WmsDbContext db, TimeProvider clock)
{
    private static OrganizationException Missing() => new(404, "현재 기업의 창고 또는 보관 항목을 찾을 수 없습니다.");
    private static OrganizationException Invalid(string message) => new(400, message);
    private static void Version(AuditableEntity item, Guid version) { if (item.Version != version) throw new OrganizationException(409, "다른 사용자가 변경했습니다. 새로고침 후 다시 저장해 주세요."); }
    private static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static void Assign(IStorageItem item, StorageItemRequest request, int maxCode = 32)
    {
        var code = request.Code.Trim().Normalize(NormalizationForm.FormKC).ToUpperInvariant();
        var name = request.Name.Trim();
        if (name.Length is < 1 or > 200 || code.Length > maxCode || !Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9._-]*$"))
            throw Invalid($"이름과 코드를 확인해 주세요. 코드는 영문·숫자로 시작하는 영문·숫자·점·밑줄·하이픈 {maxCode}자 이내입니다.");
        item.Code = code; item.Name = name; item.IsActive = request.IsActive;
    }
    private async Task<IDbContextTransaction> Begin(Guid tenantId, CancellationToken token)
    {
        var tx = await db.Database.BeginTransactionAsync(token);
        try
        {
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"warehouse:" + tenantId}, 0))", token);
            return tx;
        }
        catch { await tx.DisposeAsync(); throw; }
    }
    private async Task<Warehouse> Warehouse(Guid tenantId, Guid id, CancellationToken token) => await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, token) ?? throw Missing();
    private async Task RequireParents(Guid tenantId, Warehouse warehouse, Guid? zoneId, CancellationToken token, bool activeRequired)
    {
        if (activeRequired && !warehouse.IsActive) throw Invalid("사용 중인 창고에서만 새 항목을 만들거나 활성화할 수 있습니다.");
        if (zoneId is Guid zone)
        {
            var item = await db.WarehouseZones.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && x.Id == zone, token) ?? throw Invalid("현재 창고의 구역을 선택해 주세요.");
            if (activeRequired && !item.IsActive) throw Invalid("사용 중인 구역을 선택해 주세요.");
        }
    }
    private static object Snapshot(IStorageItem item) => item switch {
        Warehouse w => new { w.Id, w.Code, w.Name, w.IsActive, w.CustomCode, w.TypeDescription, w.Type, w.Address, w.AddressDetail, w.ContactName, w.Notes },
        WarehouseZone z => new { z.Id, z.Code, z.Name, z.IsActive },
        WarehouseRack r => new { r.Id, r.Code, r.Name, r.IsActive, r.ZoneId, r.Levels, r.Bays },
        StorageLocation l => new { l.Id, l.Code, l.Name, l.IsActive, l.ZoneId, l.RackId, l.Level, l.Bay },
        _ => throw new InvalidOperationException("Unknown storage entity")
    };
    private void Audit(Guid tenantId, Guid warehouseId, Guid actor, Guid targetId, string action, object before, object after) =>
        db.WarehouseChanges.Add(new WarehouseChange { TenantId = tenantId, WarehouseId = warehouseId, TargetId = targetId, ChangedByUserId = actor,
            ChangedAt = clock.GetUtcNow(), Action = action, BeforeJson = JsonSerializer.Serialize(before), AfterJson = JsonSerializer.Serialize(after) });
    private async Task Save(CancellationToken token)
    {
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw new OrganizationException(409, "정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요."); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23505" } || e.InnerException?.Message.Contains("UNIQUE constraint failed") == true)
        { throw new OrganizationException(409, "같은 범위에 이미 사용 중인 코드 또는 랙 위치입니다. 미사용 항목의 코드도 재사용할 수 없습니다."); }
    }
    public async Task<object> List(Guid tenantId, string? search, string status, int page, CancellationToken token)
    {
        ValidateFilter(search, status, page);
        var query = db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLowerInvariant(); query = query.Where(x => x.Name.ToLower().Contains(term) || (x.CustomCode != null && x.CustomCode.ToLower().Contains(term)) || x.Code.ToLower().Contains(term)); }
        if (status != "all") query = query.Where(x => x.IsActive == (status == "active"));
        var total = await query.CountAsync(token);
        var items = await query.OrderBy(x => x.Code).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20)
            .Select(x => new { warehouse = x, zoneCount = db.WarehouseZones.Count(z => z.TenantId == tenantId && z.WarehouseId == x.Id),
                rackCount = db.WarehouseRacks.Count(r => r.TenantId == tenantId && r.WarehouseId == x.Id), locationCount = db.StorageLocations.Count(l => l.TenantId == tenantId && l.WarehouseId == x.Id) }).ToListAsync(token);
        return new { items, total, page, pageSize = 20 };
    }
    public async Task<object> Detail(Guid tenantId, Guid id, CancellationToken token)
    {
        var warehouse = await Warehouse(tenantId, id, token);
        var zones = await db.WarehouseZones.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == id).OrderBy(x => x.Code).ToListAsync(token);
        var racks = await db.WarehouseRacks.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == id).OrderBy(x => x.Code).ToListAsync(token);
        var locationCount = await db.StorageLocations.CountAsync(x => x.TenantId == tenantId && x.WarehouseId == id, token);
        return new { warehouse, zones, racks, locationCount };
    }
    private static void ValidateFilter(string? search, string status, int page)
    {
        if (search?.Length > 100 || status is not ("all" or "active" or "inactive") || page is < 1 or > 100000) throw Invalid("검색 조건을 확인해 주세요.");
    }
    public async Task<object> Locations(Guid tenantId, Guid warehouseId, string? search, string status, Guid? zoneId, Guid? rackId, bool floorOnly, int page, CancellationToken token)
    {
        ValidateFilter(search, status, page); var warehouse = await Warehouse(tenantId, warehouseId, token);
        var query = db.StorageLocations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId);
        if (zoneId.HasValue) query = query.Where(x => x.ZoneId == zoneId || db.WarehouseRacks.Any(r => r.TenantId == tenantId && r.WarehouseId == warehouseId && r.Id == x.RackId && r.ZoneId == zoneId));
        if (rackId.HasValue) query = query.Where(x => x.RackId == rackId);
        if (floorOnly) query = query.Where(x => x.RackId == null);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLowerInvariant(); query = query.Where(x => x.Code.ToLower().Contains(term) || x.Name.ToLower().Contains(term)); }
        var views = query.Select(x => new { location = x, effectiveActive = warehouse.IsActive && x.IsActive &&
            (!x.ZoneId.HasValue || db.WarehouseZones.Any(z => z.TenantId == tenantId && z.WarehouseId == warehouseId && z.Id == x.ZoneId && z.IsActive)) &&
            (!x.RackId.HasValue || db.WarehouseRacks.Any(r => r.TenantId == tenantId && r.WarehouseId == warehouseId && r.Id == x.RackId && r.IsActive &&
                (!r.ZoneId.HasValue || db.WarehouseZones.Any(z => z.TenantId == tenantId && z.WarehouseId == warehouseId && z.Id == r.ZoneId && z.IsActive)))) });
        if (status != "all") views = views.Where(x => x.effectiveActive == (status == "active"));
        return new { items = await views.OrderBy(x => x.location.Code).ThenBy(x => x.location.Id).Skip((page - 1) * 50).Take(50).ToListAsync(token), total = await views.CountAsync(token), page, pageSize = 50 };
    }
    public async Task<Warehouse> SaveWarehouse(Guid tenantId, Guid actor, Guid? id, WarehouseRequest request, CancellationToken token)
    {
        await using var tx = await Begin(tenantId, token);
        if (!id.HasValue && request.RequestId is Guid requestId && requestId != Guid.Empty)
        {
            var existing = await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreationRequestId == requestId, token);
            if (existing != null) { await tx.CommitAsync(token); return existing; }
        }
        var item = id.HasValue ? await Warehouse(tenantId, id.Value, token) : new Warehouse { TenantId = tenantId, CreationRequestId = request.RequestId };
        if (id.HasValue && !string.IsNullOrEmpty(request.Code) && request.Code != item.Code) throw Invalid("시스템 창고 코드는 변경할 수 없습니다.");
        if (!id.HasValue)
        {
            var codes = await db.Warehouses.Where(x => x.TenantId == tenantId).Select(x => x.Code).ToListAsync(token);
            long number = codes.Where(x => x.StartsWith("WH-", StringComparison.Ordinal)).Select(x => long.TryParse(x[3..], out var n) && n >= 0 ? n : 0).DefaultIfEmpty().Max();
            if (number == long.MaxValue) throw Invalid("창고 코드 범위를 초과했습니다.");
            item.Code = $"WH-{number + 1:D4}";
        }
        if (id.HasValue) Version(item, request.Version);
        var before = id.HasValue ? JsonSerializer.SerializeToElement(Snapshot(item)) : JsonSerializer.SerializeToElement(new { });
        var name = request.Name.Trim();
        if (name.Length is < 1 or > 200) throw Invalid("창고명을 확인해 주세요.");
        var type = Optional(request.Type);
        string[] types = ["일반/상온", "실온", "냉장", "냉동", "저온", "항온·항습", "위험물", "야외", "기타"];
        if (type != null && !types.Contains(type) && (!id.HasValue || type != item.Type)) throw Invalid("창고 유형을 목록에서 선택해 주세요.");
        item.Name = name; item.IsActive = request.IsActive;
        item.CustomCode = Optional(request.CustomCode)?.Normalize(NormalizationForm.FormKC);
        if (item.CustomCode?.Any(char.IsControl) == true || item.CustomCode?.Length > 64) throw Invalid("자체 창고 코드를 확인해 주세요.");
        item.NormalizedCustomCode = item.CustomCode?.ToUpperInvariant();
        item.TypeDescription = type == "기타" ? Optional(request.TypeDescription) : type == item.Type ? item.TypeDescription : null;
        item.Type = type; item.Address = Optional(request.Address); item.AddressDetail = Optional(request.AddressDetail); item.ContactName = Optional(request.ContactName); item.Notes = Optional(request.Notes);
        if (!id.HasValue) db.Warehouses.Add(item);
        Audit(tenantId, item.Id, actor, item.Id, id.HasValue ? "WarehouseUpdated" : "WarehouseCreated", before, Snapshot(item));
        await Save(token); await tx.CommitAsync(token); return item;
    }
    public async Task<WarehouseZone> SaveZone(Guid tenantId, Guid warehouseId, Guid actor, Guid? id, StorageItemRequest request, CancellationToken token)
    {
        await using var tx = await Begin(tenantId, token); var warehouse = await Warehouse(tenantId, warehouseId, token);
        var item = id.HasValue ? await db.WarehouseZones.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == id, token) ?? throw Missing() : new WarehouseZone { TenantId = tenantId, WarehouseId = warehouseId };
        if (id.HasValue) Version(item, request.Version);
        await RequireParents(tenantId, warehouse, null, token, !id.HasValue || (!item.IsActive && request.IsActive));
        var before = id.HasValue ? JsonSerializer.SerializeToElement(Snapshot(item)) : JsonSerializer.SerializeToElement(new { });
        Assign(item, request); if (!id.HasValue) db.WarehouseZones.Add(item);
        Audit(tenantId, warehouseId, actor, item.Id, id.HasValue ? "ZoneUpdated" : "ZoneCreated", before, Snapshot(item));
        await Save(token); await tx.CommitAsync(token); return item;
    }
    public async Task<WarehouseRack> SaveRack(Guid tenantId, Guid warehouseId, Guid actor, Guid? id, RackRequest request, CancellationToken token)
    {
        if (request.Levels is < 1 or > 100 || request.Bays is < 1 or > 100 || request.Levels * request.Bays > 1000) throw Invalid("랙은 1~100단·칸, 총 1,000개 위치 이내로 설정해 주세요.");
        await using var tx = await Begin(tenantId, token); var warehouse = await Warehouse(tenantId, warehouseId, token);
        var item = id.HasValue ? await db.WarehouseRacks.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == id, token) ?? throw Missing() : new WarehouseRack { TenantId = tenantId, WarehouseId = warehouseId, ZoneId = request.ZoneId };
        if (id.HasValue) Version(item, request.Version);
        if (id.HasValue && item.ZoneId != request.ZoneId) throw Invalid("기존 랙의 소속 구역은 변경할 수 없습니다.");
        if (request.Levels < item.Levels || request.Bays < item.Bays) throw Invalid("기존 위치를 보존하기 위해 단·칸 수는 확장만 가능합니다. 필요 없는 위치는 미사용으로 설정해 주세요.");
        await RequireParents(tenantId, warehouse, request.ZoneId, token, !id.HasValue || (!item.IsActive && request.IsActive) || request.Levels > item.Levels || request.Bays > item.Bays);
        var before = id.HasValue ? JsonSerializer.SerializeToElement(Snapshot(item)) : JsonSerializer.SerializeToElement(new { });
        Assign(item, request); if (!id.HasValue) db.WarehouseRacks.Add(item);
        var added = new List<StorageLocation>();
        for (var level = 1; level <= request.Levels; level++) for (var bay = 1; bay <= request.Bays; bay++)
            if (level > item.Levels || bay > item.Bays)
                added.Add(new StorageLocation { TenantId = tenantId, WarehouseId = warehouseId, RackId = item.Id, Level = level, Bay = bay,
                    Code = $"{item.Code}-L{level:D2}-B{bay:D2}", Name = $"{item.Name} {level}단 {bay}칸" });
        item.Levels = request.Levels; item.Bays = request.Bays;
        db.StorageLocations.AddRange(added);
        Audit(tenantId, warehouseId, actor, item.Id, id.HasValue ? "RackUpdated" : "RackCreated", before, new { rack = Snapshot(item), generated = added.Select(x => new { x.Id, x.Code, x.Level, x.Bay }) });
        await Save(token); await tx.CommitAsync(token); return item;
    }
    public async Task<StorageLocation> SaveLocation(Guid tenantId, Guid warehouseId, Guid actor, Guid? id, StorageItemRequest request, Guid? zoneId, CancellationToken token)
    {
        await using var tx = await Begin(tenantId, token); var warehouse = await Warehouse(tenantId, warehouseId, token);
        var item = id.HasValue ? await db.StorageLocations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == id, token) ?? throw Missing() : new StorageLocation { TenantId = tenantId, WarehouseId = warehouseId, ZoneId = zoneId };
        if (id.HasValue) Version(item, request.Version);
        var activeRequired = !id.HasValue || (!item.IsActive && request.IsActive);
        var parentZone = item.ZoneId;
        if (item.RackId is Guid rackId)
        {
            var rack = await db.WarehouseRacks.SingleAsync(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Id == rackId, token);
            parentZone = rack.ZoneId;
            if (activeRequired && !rack.IsActive) throw Invalid("사용 중인 랙에서만 위치를 활성화할 수 있습니다.");
        }
        await RequireParents(tenantId, warehouse, parentZone, token, activeRequired);
        var before = id.HasValue ? JsonSerializer.SerializeToElement(Snapshot(item)) : JsonSerializer.SerializeToElement(new { });
        Assign(item, request, 64); if (!id.HasValue) db.StorageLocations.Add(item);
        Audit(tenantId, warehouseId, actor, item.Id, id.HasValue ? "LocationUpdated" : "LocationCreated", before, Snapshot(item));
        await Save(token); await tx.CommitAsync(token); return item;
    }
}
