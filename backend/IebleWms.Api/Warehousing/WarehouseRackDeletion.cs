using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Inventory;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Warehousing;

public sealed partial class WarehousePlanService
{
    public async Task<object> DeleteRacks(Guid tenant, Guid warehouse, Guid actor, DeleteWarehouseRacksRequest request, CancellationToken ct)
    {
        if (request.Racks == null || request.Racks.Count > 500 || request.Racks.Any(r => r == null || r.Id == Guid.Empty) || request.Racks.Select(r => r.Id).Distinct().Count() != request.Racks.Count)
            throw new OrganizationException(400, "삭제할 랙을 확인해 주세요.");
        if (request.Zones == null || request.Zones.Count > 500 || request.Racks.Count + request.Zones.Count == 0 || request.Zones.Any(z => z == null || z.Id == Guid.Empty) || request.Zones.Select(z => z.Id).Distinct().Count() != request.Zones.Count)
            throw new OrganizationException(400, "삭제할 구역을 확인해 주세요.");
        // Serialize with placement/reservation/stock writers, including JSON-only receipt placements.
        await using var tx = await InventoryTransactions.Begin(db, tenant, ct);
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"warehouse:" + tenant}, 0))", ct);
        await RequireWarehouse(tenant, warehouse, ct);
        var ids = request.Racks.Select(r => r.Id).ToArray();
        var racks = await db.WarehouseRacks.Where(r => r.TenantId == tenant && r.WarehouseId == warehouse && ids.Contains(r.Id)).ToListAsync(ct);
        if (racks.Count != ids.Length) throw Missing();
        var zoneIds = request.Zones.Select(z => z.Id).ToArray();
        var zones = await db.WarehouseZones.Where(z => z.TenantId == tenant && z.WarehouseId == warehouse && zoneIds.Contains(z.Id)).ToListAsync(ct);
        if (zones.Count != zoneIds.Length) throw Missing();
        if (zones.Any(z => request.Zones.Single(x => x.Id == z.Id).Version != z.Version))
            throw new OrganizationException(409, "구역이 변경되었습니다. 최신 정보를 확인해 주세요.");
        if (await db.WarehouseRacks.AnyAsync(r => r.TenantId == tenant && r.WarehouseId == warehouse && r.ZoneId != null && zoneIds.Contains(r.ZoneId.Value), ct)
            || await db.StorageLocations.AnyAsync(l => l.TenantId == tenant && l.WarehouseId == warehouse && l.ZoneId != null && zoneIds.Contains(l.ZoneId.Value), ct))
            throw new OrganizationException(409, "구역에 연결된 랙 또는 보관 위치를 먼저 정리해 주세요. 하위 구조는 자동 삭제하지 않습니다.");
        if (await db.Stocktakes.AnyAsync(s => s.TenantId == tenant && s.WarehouseId == warehouse && s.Scope == "Zone" && s.ScopeId != null && zoneIds.Contains(s.ScopeId.Value), ct))
            throw new OrganizationException(409, "해당 구역에 연결된 실사 내역이 있어 삭제할 수 없습니다.");
        var plan = await db.WarehousePlans.SingleOrDefaultAsync(p => p.TenantId == tenant && p.WarehouseId == warehouse, ct);
        if ((plan?.Version ?? Guid.Empty) != request.PlanVersion || racks.Any(r => request.Racks.Single(x => x.Id == r.Id).Version != r.Version))
            throw new OrganizationException(409, "랙 또는 도면이 변경되었습니다. 편집 내용을 보관하고 최신 정보를 확인해 주세요.");
        var locations = await db.StorageLocations.Where(l => l.TenantId == tenant && l.WarehouseId == warehouse && l.RackId != null && ids.Contains(l.RackId.Value)).ToListAsync(ct);
        var locationIds = locations.Select(l => l.Id).ToArray();
        var blocked = await db.StockBalances.AnyAsync(x => x.TenantId == tenant && x.WarehouseId == warehouse && locationIds.Contains(x.LocationId), ct)
            || await db.InboundReceiptLines.AnyAsync(x => x.TenantId == tenant && x.PlannedRackId != null && ids.Contains(x.PlannedRackId.Value), ct)
            || await db.OutboundShipmentLines.AnyAsync(x => x.TenantId == tenant && x.PlannedRackId != null && ids.Contains(x.PlannedRackId.Value), ct)
            || await db.ShipmentAllocations.AnyAsync(x => x.TenantId == tenant && ((x.SourceRackId != null && ids.Contains(x.SourceRackId.Value)) || (x.SourceLocationId != null && locationIds.Contains(x.SourceLocationId.Value))), ct)
            || await db.InventoryOperations.AnyAsync(x => x.TenantId == tenant && ((x.SourceLocationId != null && locationIds.Contains(x.SourceLocationId.Value)) || (x.DestinationLocationId != null && locationIds.Contains(x.DestinationLocationId.Value))), ct)
            || await db.Stocktakes.AnyAsync(x => x.TenantId == tenant && x.WarehouseId == warehouse && x.ScopeId != null && ((x.Scope == "Rack" && ids.Contains(x.ScopeId.Value)) || (x.Scope == "Location" && locationIds.Contains(x.ScopeId.Value))), ct)
            || await db.StocktakeTargets.AnyAsync(x => x.TenantId == tenant && x.WarehouseId == warehouse && locationIds.Contains(x.LocationId), ct);
        var receiptPlacements = await db.InboundReceiptLines.AsNoTracking()
            .Where(x => x.TenantId == tenant && db.InboundReceipts.Any(d => d.TenantId == tenant && d.Id == x.ReceiptId && d.WarehouseId == warehouse))
            .Select(x => x.PlacementsJson).ToListAsync(ct);
        blocked |= receiptPlacements.Any(json => (JsonSerializer.Deserialize<IebleWms.Api.Models.ReceiptPlacement[]>(json) ?? []).Any(p => locationIds.Contains(p.LocationId)));
        if (blocked) throw new OrganizationException(409, "해당 랙에 재고 또는 진행 중인 작업·업무 이력이 있어 삭제할 수 없습니다. 재고와 작업 상태를 먼저 확인해 주세요.");
        var objects = await db.WarehousePlanObjects.Where(o => o.TenantId == tenant && o.WarehouseId == warehouse && ((o.ZoneId != null && zoneIds.Contains(o.ZoneId.Value)) || (o.RackId != null && ids.Contains(o.RackId.Value)) || (o.LocationId != null && locationIds.Contains(o.LocationId.Value)))).ToListAsync(ct);
        var barcodes = await db.StorageBarcodes.Where(b => b.TenantId == tenant && b.WarehouseId == warehouse && ((b.RackId != null && ids.Contains(b.RackId.Value)) || (b.LocationId != null && locationIds.Contains(b.LocationId.Value)))).ToListAsync(ct);
        foreach (var rack in racks)
            db.WarehouseChanges.Add(new() { TenantId=tenant, WarehouseId=warehouse, TargetId=rack.Id, ChangedByUserId=actor, ChangedAt=clock.GetUtcNow(), Action="RackDeleted", BeforeJson=JsonSerializer.Serialize(new { rack, locations=locations.Where(l=>l.RackId==rack.Id) }), AfterJson="{}" });
        foreach (var zone in zones)
            db.WarehouseChanges.Add(new() { TenantId=tenant, WarehouseId=warehouse, TargetId=zone.Id, ChangedByUserId=actor, ChangedAt=clock.GetUtcNow(), Action="ZoneDeleted", BeforeJson=JsonSerializer.Serialize(zone), AfterJson="{}" });
        db.WarehouseZones.RemoveRange(zones);
        db.WarehousePlanObjects.RemoveRange(objects);
        db.StorageBarcodes.RemoveRange(barcodes);
        db.StorageLocations.RemoveRange(locations);
        db.WarehouseRacks.RemoveRange(racks);
        if (plan != null) db.Entry(plan).Property(p => p.AspectRatio).IsModified = true;
        try { await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new OrganizationException(409, "랙 또는 도면이 변경되었습니다. 최신 정보를 확인해 주세요."); }
        catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: "23503" })
        { throw new OrganizationException(409, "해당 랙을 참조하는 업무가 있어 삭제할 수 없습니다."); }
        return new { zoneIds, rackIds=ids, locationIds, objectIds=objects.Select(o=>o.Id).ToArray(), planVersion=plan?.Version ?? Guid.Empty };
    }
}
