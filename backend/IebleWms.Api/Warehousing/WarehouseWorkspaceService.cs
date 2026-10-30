using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Warehousing;

public sealed class WarehouseWorkspaceService(WmsDbContext db, WarehouseService storage, WarehousePlanService plans, TimeProvider clock)
{
    private static OrganizationException Invalid(string message) => new(400, message);
    private static OrganizationException Conflict(string message) => new(409, message);
    private static string Code(string value) => value.Trim().Normalize(NormalizationForm.FormKC).ToUpperInvariant();
    private static void Validate(object value)
    {
        if (!Validator.TryValidateObject(value, new(value), [], true)) throw Invalid("창고·구역·랙·위치의 입력 형식을 확인해 주세요.");
    }
    private static void CheckVersion(AuditableEntity entity, Guid version)
    {
        if (entity.Version != version) throw Conflict("창고 구조가 다른 작업에서 변경되었습니다. 작업 내용을 보관한 뒤 최신 정보를 다시 불러와 주세요.");
    }
    private static StorageItemRequest Item(WorkspaceStructureRequest value) => new() { Version = value.Version, Code = value.Code, Name = value.Name, IsActive = value.IsActive };
    private static bool Changed(IStorageItem item, WorkspaceStructureRequest value) => item.Code != Code(value.Code) || item.Name != value.Name.Trim() || item.IsActive != value.IsActive;
    private static Guid? Resolve(Guid? clientId, Dictionary<Guid, Guid> map, string label) => clientId == null ? null : map.TryGetValue(clientId.Value, out var id) ? id : throw Invalid($"{label} 연결을 확인해 주세요. 현재 작업에 포함된 항목만 연결할 수 있습니다.");

    public async Task<object> Read(Guid tenant, Guid warehouse, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(db.Database.IsNpgsql() ? System.Data.IsolationLevel.RepeatableRead : System.Data.IsolationLevel.Serializable, ct);
        var detail = await storage.Detail(tenant, warehouse, ct);
        var plan = await plans.Read(tenant, warehouse, ct);
        var floorLocations = await db.StorageLocations.AsNoTracking().Where(x => x.TenantId == tenant && x.WarehouseId == warehouse && x.RackId == null).OrderBy(x => x.Code).ToListAsync(ct);
        await tx.CommitAsync(ct);
        return new { detail, plan, floorLocations };
    }

    public async Task<WarehouseWorkspaceSaved> Save(Guid tenant, Guid? warehouseId, Guid actor, SaveWarehouseWorkspaceRequest request, bool canCreateStructure, CancellationToken ct)
    {
        Validate(request); Validate(request.Warehouse);
        if (request.Plan != null)
        {
            Validate(request.Plan);
            foreach (var obj in request.Plan.Objects) { if (obj == null) throw Invalid("도면 객체를 확인해 주세요."); Validate(obj); }
        }
        if (request.RequestId == Guid.Empty) throw Invalid("저장 요청 ID가 필요합니다.");
        var all = request.Zones.Cast<WorkspaceStructureRequest>().Concat(request.Racks).Concat(request.FloorLocations).ToArray();
        foreach (var row in all) { if (row == null) throw Invalid("구조 정보를 확인해 주세요."); Validate(row); }
        if (all.Any(x => x.ClientId == Guid.Empty || x.Id == Guid.Empty || (x.Id.HasValue && x.Id != x.ClientId)) || all.Select(x => x.ClientId).Distinct().Count() != all.Length)
            throw Invalid("임시 구조 ID는 중복될 수 없으며 기존 항목의 ID는 변경할 수 없습니다.");
        if (!warehouseId.HasValue && all.Any(x => x.Id.HasValue)) throw Invalid("새 창고에는 다른 창고의 기존 구조를 가져올 수 없습니다.");
        if (!canCreateStructure && all.Any(x => x.Id == null)) throw new OrganizationException(403, "새 구역·랙·위치를 추가하려면 창고 등록 권한이 필요합니다.");
        if (request.Racks.Any(x => x.Levels * x.Bays > 1000)) throw Invalid("랙당 최대 1,000개 위치까지 설정할 수 있습니다.");

        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { warehouseId, request })));
        await using var tx = await WarehouseWriteScope.Begin(db, tenant, ct);
        var receipt = await db.WarehouseSaveReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.RequestId == request.RequestId, ct);
        if (receipt != null)
        {
            if (receipt.ActorId != actor || receipt.RequestHash != hash) throw Conflict("이미 처리된 저장 요청입니다. 같은 저장 내용으로 결과를 확인해 주세요.");
            return JsonSerializer.Deserialize<WarehouseWorkspaceSaved>(receipt.ResponseJson)!;
        }
        // The aggregate receipt owns idempotency; do not reuse individual-create request keys.
        var warehouseRequest = JsonSerializer.Deserialize<WarehouseRequest>(JsonSerializer.Serialize(request.Warehouse))!;
        warehouseRequest.RequestId = null;
        // A new aggregate is assembled before its requested inactive state is published.
        // This never activates an existing warehouse or bypasses its expansion policy.
        var deactivateNewWarehouse = !warehouseId.HasValue && !warehouseRequest.IsActive && all.Length > 0;
        if (deactivateNewWarehouse) warehouseRequest.IsActive = true;
        var warehouse = await storage.SaveWarehouse(tenant, actor, warehouseId, warehouseRequest, ct);
        var existingZones = await db.WarehouseZones.Where(x => x.TenantId == tenant && x.WarehouseId == warehouse.Id).ToDictionaryAsync(x => x.Id, ct);
        var existingRacks = await db.WarehouseRacks.Where(x => x.TenantId == tenant && x.WarehouseId == warehouse.Id).ToDictionaryAsync(x => x.Id, ct);
        var existingFloors = await db.StorageLocations.Where(x => x.TenantId == tenant && x.WarehouseId == warehouse.Id && x.RackId == null).ToDictionaryAsync(x => x.Id, ct);
        var zones = new Dictionary<Guid, Guid>(); var racks = new Dictionary<Guid, Guid>(); var floors = new Dictionary<Guid, Guid>();
        var generatedRacks = new List<(Guid ClientId, Guid Id, int Levels, int Bays)>();
        var deactivateNewZones = new List<(WarehouseZone Entity, WorkspaceStructureRequest Request)>();
        var additions = request.FloorLocations.Count(x => x.Id == null);
        foreach (var value in request.Racks)
        {
            var previous = value.Id.HasValue && existingRacks.TryGetValue(value.Id.Value, out var rack) ? rack.Levels * rack.Bays : 0;
            additions += Math.Max(0, value.Levels * value.Bays - previous);
        }
        if (additions > 10_000) throw Invalid("한 번의 저장에서는 보관 위치를 최대 10,000개까지 추가할 수 있습니다.");
        foreach (var value in request.Zones)
        {
            WarehouseZone? old = null;
            if (value.Id is Guid id) { if (!existingZones.TryGetValue(id, out old)) throw Invalid("현재 창고의 구역만 수정할 수 있습니다."); CheckVersion(old, value.Version); }
            var zoneRequest = Item(value);
            var deactivate = old == null && !value.IsActive && (request.Racks.Any(r => r.ZoneClientId == value.ClientId) || request.FloorLocations.Any(l => l.ZoneClientId == value.ClientId));
            if (deactivate) zoneRequest.IsActive = true;
            var entity = old != null && !Changed(old, value) ? old : await storage.SaveZone(tenant, warehouse.Id, actor, value.Id, zoneRequest, ct);
            if (deactivate) deactivateNewZones.Add((entity, value));
            zones[value.ClientId] = entity.Id;
        }
        foreach (var value in request.Racks)
        {
            var zone = Resolve(value.ZoneClientId, zones, "소속 구역");
            WarehouseRack? old = null;
            if (value.Id is Guid id) { if (!existingRacks.TryGetValue(id, out old)) throw Invalid("현재 창고의 랙만 수정할 수 있습니다."); CheckVersion(old, value.Version); }
            var levels = old?.Levels ?? 0; var bays = old?.Bays ?? 0;
            var unchanged = old != null && !Changed(old, value) && old.ZoneId == zone && old.Levels == value.Levels && old.Bays == value.Bays;
            var entity = unchanged ? old! : await storage.SaveRack(tenant, warehouse.Id, actor, value.Id, new RackRequest { Version = value.Version, Name = value.Name, Code = value.Code, IsActive = value.IsActive, ZoneId = zone, Levels = value.Levels, Bays = value.Bays }, ct);
            racks[value.ClientId] = entity.Id;
            if (entity.Levels > levels || entity.Bays > bays) generatedRacks.Add((value.ClientId, entity.Id, levels, bays));
        }
        foreach (var value in request.FloorLocations)
        {
            var zone = Resolve(value.ZoneClientId, zones, "바닥 위치 구역");
            StorageLocation? old = null;
            if (value.Id is Guid id)
            {
                if (!existingFloors.TryGetValue(id, out old)) throw Invalid("현재 창고의 바닥 위치만 수정할 수 있습니다.");
                CheckVersion(old, value.Version);
                if (old.ZoneId != zone) throw Invalid("기존 바닥 위치의 소속 구역은 변경할 수 없습니다.");
            }
            var entity = old != null && !Changed(old, value) ? old : await storage.SaveLocation(tenant, warehouse.Id, actor, value.Id, Item(value), zone, ct);
            floors[value.ClientId] = entity.Id;
        }
        foreach (var entry in deactivateNewZones)
        {
            var finalZone = Item(entry.Request); finalZone.Version = entry.Entity.Version;
            await storage.SaveZone(tenant, warehouse.Id, actor, entry.Entity.Id, finalZone, ct);
        }
        if (deactivateNewWarehouse)
        {
            warehouseRequest.IsActive = false; warehouseRequest.Version = warehouse.Version;
            await storage.SaveWarehouse(tenant, actor, warehouse.Id, warehouseRequest, ct);
        }
        if (request.Plan != null)
        {
            var mapped = JsonSerializer.Deserialize<SaveWarehousePlanRequest>(JsonSerializer.Serialize(request.Plan))!;
            foreach (var obj in mapped.Objects)
            {
                obj.ZoneId = Resolve(obj.ZoneId, zones, "도면 구역"); obj.RackId = Resolve(obj.RackId, racks, "도면 랙");
                if (obj.LocationId is Guid location && floors.TryGetValue(location, out var actual)) obj.LocationId = actual;
            }
            await plans.Save(tenant, warehouse.Id, actor, mapped, ct);
        }
        var slots = new Dictionary<string, Guid>();
        foreach (var generated in generatedRacks)
        {
            var locations = await db.StorageLocations.AsNoTracking().Where(x => x.TenantId == tenant && x.WarehouseId == warehouse.Id && x.RackId == generated.Id && (x.Level > generated.Levels || x.Bay > generated.Bays)).ToListAsync(ct);
            foreach (var location in locations) slots[$"{generated.ClientId}:{location.Level}:{location.Bay}"] = location.Id;
        }
        var response = new WarehouseWorkspaceSaved(warehouse.Id, warehouse.Code, zones, racks, floors, slots);
        db.WarehouseSaveReceipts.Add(new() { TenantId = tenant, RequestId = request.RequestId, WarehouseId = warehouse.Id, ActorId = actor, RequestHash = hash, ResponseJson = JsonSerializer.Serialize(response), CreatedAt = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return response;
    }
}
