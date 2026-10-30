using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Warehousing;

public sealed class WarehousePlanService(WmsDbContext db, TimeProvider clock)
{
    private static readonly HashSet<string> Types = ["wall","zone","rack","aisle","door","text","shape"];
    private static OrganizationException Missing()=>new(404,"현재 기업의 창고 또는 랙을 찾을 수 없습니다.");
    private async Task RequireWarehouse(Guid tenant,Guid warehouse,CancellationToken ct){if(!await db.Warehouses.AnyAsync(x=>x.TenantId==tenant&&x.Id==warehouse,ct))throw Missing();}
    private static PlanObjectDto Dto(WarehousePlanObject o)=>new(){Id=o.Id,Type=o.Type,Label=o.Label,X=o.X,Y=o.Y,Width=o.Width,Height=o.Height,Rotation=o.Rotation,Fill=o.Fill,Shape=o.Shape,RackId=o.RackId,ZoneId=o.ZoneId,LocationId=o.LocationId};
    private async Task<object> Snapshot(Guid tenant,Guid warehouse,CancellationToken ct)
    {
        var p=await db.WarehousePlans.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouse,ct);
        var objects=await db.WarehousePlanObjects.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse).OrderBy(x=>x.SortOrder).ToListAsync(ct);
        return new{exists=p!=null,version=p?.Version??Guid.Empty,schemaVersion=p?.SchemaVersion??1,aspectRatio=p?.AspectRatio??1.5,objects=objects.Select(Dto),updatedAt=p?.UpdatedAt,updatedByUserId=p?.UpdatedByUserId};
    }
    public async Task<object> Read(Guid tenant,Guid warehouse,CancellationToken ct){await RequireWarehouse(tenant,warehouse,ct);return await Snapshot(tenant,warehouse,ct);}
    public async Task<object> History(Guid tenant,Guid warehouse,CancellationToken ct)
    {
        await RequireWarehouse(tenant,warehouse,ct);
        return await db.WarehouseChanges.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.Action=="PlanSaved")
            .OrderByDescending(x=>x.Id).Take(50).Select(x=>new{x.Id,x.ChangedByUserId,x.ChangedAt,x.BeforeJson,x.AfterJson}).ToListAsync(ct);
    }
    public async Task<object> Rack(Guid tenant,Guid warehouse,Guid rack,CancellationToken ct)
    {
        await RequireWarehouse(tenant,warehouse,ct);
        var r=await db.WarehouseRacks.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.Id==rack,ct)??throw Missing();
        var locations=await db.StorageLocations.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.RackId==rack).OrderBy(x=>x.Level).ThenBy(x=>x.Bay).ToListAsync(ct);
        var warehouseActive=await db.Warehouses.Where(x=>x.TenantId==tenant&&x.Id==warehouse).Select(x=>x.IsActive).SingleAsync(ct);
        var zoneActive=r.ZoneId==null||await db.WarehouseZones.AnyAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.Id==r.ZoneId&&x.IsActive,ct);
        return new{rack=r,locations=locations.Select(l=>new{location=l,effectiveActive=l.IsActive&&r.IsActive&&warehouseActive&&zoneActive}),inventoryAvailable=false};
    }
    public async Task<object> Save(Guid tenant,Guid warehouse,Guid actor,SaveWarehousePlanRequest request,CancellationToken ct)
    {
        var validation = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
        if (!System.ComponentModel.DataAnnotations.Validator.TryValidateObject(request, new(request), validation, true)
            || request.Objects.Any(o => o is null || !System.ComponentModel.DataAnnotations.Validator.TryValidateObject(o, new(o), validation, true)))
            throw new OrganizationException(400,"도면의 좌표·크기·색상·형식을 확인해 주세요.");
        if(request.Objects is null||request.Objects.Count>500||request.Objects.Any(o=>o is null||o.Id==Guid.Empty||!Types.Contains(o.Type))||request.Objects.Select(o=>o.Id).Distinct().Count()!=request.Objects.Count)
            throw new OrganizationException(400,"도면 객체의 종류·ID·개수를 확인해 주세요(최대 500개).");
        await using var tx = await WarehouseWriteScope.Begin(db, tenant, ct);
        await RequireWarehouse(tenant,warehouse,ct);
        var plan=await db.WarehousePlans.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouse,ct);
        if((plan?.Version??Guid.Empty)!=request.Version)throw new OrganizationException(409,"다른 사용자가 도면을 저장했습니다. 변경사항을 보관하거나 최신 도면을 다시 불러와 주세요.");
        var linkedRacks = request.Objects.Where(o => o.RackId != null).Select(o => o.RackId!.Value).ToArray();
        if (linkedRacks.Distinct().Count() != linkedRacks.Length)
            throw new OrganizationException(400,"같은 랙은 도면의 한 객체에만 연결할 수 있습니다. 중복 연결을 해제해 주세요.");
        var zoneIds = request.Objects.Where(o => o.ZoneId != null).Select(o => o.ZoneId!.Value).Distinct().ToArray();
        var zones = await db.WarehouseZones.Where(x => x.TenantId == tenant && x.WarehouseId == warehouse && zoneIds.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct);
        if (zones.Count != zoneIds.Length || request.Objects.Any(o => o.ZoneId != null && o.Type != "zone"))
            throw new OrganizationException(400,"구역 객체에는 현재 기업의 같은 창고 구역만 연결할 수 있습니다.");
        var rackIds=request.Objects.Where(o=>o.RackId!=null).Select(o=>o.RackId!.Value).Distinct().ToArray();
        var locationIds=request.Objects.Where(o=>o.LocationId!=null).Select(o=>o.LocationId!.Value).Distinct().ToArray();
        var racks=await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&rackIds.Contains(x.Id)).Select(x=>x.Id).ToListAsync(ct);
        var locations=await db.StorageLocations.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&locationIds.Contains(x.Id)).Select(x=>new{x.Id,x.RackId}).ToListAsync(ct);
        if(racks.Count!=rackIds.Length||locations.Count!=locationIds.Length||request.Objects.Any(o=>o.RackId!=null&&(o.Type!="rack"||(o.LocationId!=null&&locations.Single(l=>l.Id==o.LocationId).RackId!=o.RackId))))
            throw new OrganizationException(400,"연결할 랙과 보관 위치는 현재 기업의 같은 창고에 속해야 합니다.");
        var before=await Snapshot(tenant,warehouse,ct);
        if(plan==null){plan=new(){TenantId=tenant,WarehouseId=warehouse};db.WarehousePlans.Add(plan);}
        plan.SchemaVersion=request.SchemaVersion;plan.AspectRatio=request.AspectRatio;
        // Ensure version/audit timestamps change even when only child geometry changes.
        if(db.Entry(plan).State!=EntityState.Added)db.Entry(plan).Property(x=>x.AspectRatio).IsModified=true;
        var rows=await db.WarehousePlanObjects.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse).ToListAsync(ct);
        var ids=request.Objects.Select(o=>o.Id).ToHashSet();db.WarehousePlanObjects.RemoveRange(rows.Where(o=>!ids.Contains(o.Id)));
        for(int i=0;i<request.Objects.Count;i++){
            var dto=request.Objects[i];var row=rows.SingleOrDefault(o=>o.Id==dto.Id);
            if(row==null){row=new(){TenantId=tenant,WarehouseId=warehouse,Id=dto.Id};db.WarehousePlanObjects.Add(row);}
            row.Type=dto.Type;row.Label=dto.Label;row.X=dto.X;row.Y=dto.Y;row.Width=dto.Width;row.Height=dto.Height;row.Rotation=dto.Rotation;row.Fill=dto.Fill;row.Shape=dto.Shape;row.RackId=dto.RackId;row.ZoneId=dto.ZoneId;row.LocationId=dto.LocationId;row.SortOrder=i;
        }
        db.WarehouseChanges.Add(new(){TenantId=tenant,WarehouseId=warehouse,TargetId=warehouse,ChangedByUserId=actor,ChangedAt=clock.GetUtcNow(),Action="PlanSaved",BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(new{request.SchemaVersion,request.AspectRatio,request.Objects})});
        try{await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}
        catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"도면이 변경되었습니다. 최신 도면을 다시 확인해 주세요.");}
        return await Snapshot(tenant,warehouse,ct);
    }
}
