using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Shipping;
public sealed class ShipmentRackQuery
{
    public string Sort { get; set; } = "route";
    public decimal Quantity { get; set; }
    public Guid? ShipmentId { get; set; }
    public Guid? RackId { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string[] Serials { get; set; } = [];
    public Guid[] SelectedRackIds { get; set; } = [];
}
public sealed partial class ShipmentService
{
    public async Task<object> RackChoices(Guid tenant,Guid? warehouseId,Guid? productId,string? search,int page,ShipmentRackQuery query,CancellationToken ct)
    {
        if(query.Quantity<0||query.Quantity>999999999.999m || !warehouseId.HasValue || page is <1 or >100000 || search?.Length>100 || query.Sort is not ("route" or "stock") || query.LotNumber?.Length>100 || query.Serials.Length>1000 || query.SelectedRackIds.Length>100)throw Error("랙 조회 조건을 확인해 주세요.");
        if(!await db.Warehouses.AnyAsync(w=>w.TenantId==tenant&&w.Id==warehouseId&&w.IsActive,ct))throw Error("사용 가능한 출고 창고를 선택해 주세요.");
        var product=productId.HasValue?await db.Products.AsNoTracking().SingleOrDefaultAsync(p=>p.TenantId==tenant&&p.Id==productId&&p.IsActive,ct):null;
        if(productId.HasValue&&product==null)throw Error("상품을 찾을 수 없습니다.",404);
        if(query.ShipmentId.HasValue){var doc=await db.OutboundShipments.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==query.ShipmentId,ct)??throw Error("출고 문서를 찾을 수 없습니다.",404);if(doc.Status!="Requested")throw Error("출고 상태가 변경되었습니다.",409);}
        var racks=await db.WarehouseRacks.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&x.IsActive&&(x.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouseId&&z.Id==x.ZoneId&&z.IsActive))).OrderBy(x=>x.Code).ThenBy(x=>x.Id).ToListAsync(ct);
        var ids=racks.Select(x=>x.Id).ToHashSet();if(query.SelectedRackIds.Any(id=>!ids.Contains(id)) || (query.RackId.HasValue&&!ids.Contains(query.RackId.Value)))throw Error("현재 창고의 랙만 선택할 수 있습니다.");
        var lot=string.IsNullOrWhiteSpace(query.LotNumber)?null:query.LotNumber.Trim();var serials=query.Serials.Select(x=>x.Trim()).Distinct().ToArray();
        var stocks=from s in db.StockBalances.AsNoTracking() join l in ActiveLocations(tenant,warehouseId.Value) on s.LocationId equals l.Id
            where s.TenantId==tenant&&s.WarehouseId==warehouseId&&l.RackId!=null&&(!productId.HasValue||s.ProductId==productId)&&
                db.Products.Any(p=>p.TenantId==tenant&&p.Id==s.ProductId&&p.IsActive&&p.Unit==s.Unit)&&
                (lot==null||s.LotNumber==lot)&&(!query.ExpiryDate.HasValue||s.ExpiryDate==query.ExpiryDate)&&(serials.Length==0||(s.SerialNumber!=null&&serials.Contains(s.SerialNumber)))
            select new {s.Id,s.Quantity,s.ReservedQuantity,l.RackId};
        var totals=!productId.HasValue?[]:db.Database.IsNpgsql()?await stocks.GroupBy(x=>x.RackId).Select(g=>new RackTotal(g.Key!.Value,g.Sum(s=>s.Quantity),g.Sum(s=>s.ReservedQuantity))).ToListAsync(ct)
            :await stocks.GroupBy(x=>x.RackId).Select(g=>new RackTotal(g.Key!.Value,(decimal)g.Sum(s=>(double)s.Quantity),(decimal)g.Sum(s=>(double)s.ReservedQuantity))).ToListAsync(ct);
        var own=from a in db.ShipmentAllocations.AsNoTracking() join l in db.OutboundShipmentLines on new{a.TenantId,Id=a.LineId} equals new{l.TenantId,l.Id}
            join s in stocks on a.StockId equals s.Id where a.TenantId==tenant&&l.ShipmentId==query.ShipmentId&&a.State=="Active" select new{s.RackId,a.Quantity};
        var ownTotals=!productId.HasValue||!query.ShipmentId.HasValue?[]:db.Database.IsNpgsql()?await own.GroupBy(x=>x.RackId).Select(g=>new RackTotal(g.Key!.Value,g.Sum(x=>x.Quantity),0)).ToListAsync(ct)
            :await own.GroupBy(x=>x.RackId).Select(g=>new RackTotal(g.Key!.Value,(decimal)g.Sum(x=>(double)x.Quantity),0)).ToListAsync(ct);
        var route=new ShipmentRouteOrder.Result([],"");
        if(query.Sort=="route"){
            var plan=await db.WarehousePlans.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId,ct);
            var objects=await db.WarehousePlanObjects.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId).ToListAsync(ct);
            route=ShipmentRouteOrder.Calculate(objects,plan?.AspectRatio??1.5,ids,query.SelectedRackIds);
        }
        var options=racks.Select(r=>{var t=totals.FirstOrDefault(x=>x.Id==r.Id);var mine=ownTotals.FirstOrDefault(x=>x.Id==r.Id)?.Physical??0;return new {
            r.Id,r.Name,r.Code,unit=product?.Unit,lotManaged=false,expiryManaged=false,serialManaged=false,
            rackPhysical=productId.HasValue?t?.Physical??0:(decimal?)null,rackAvailable=productId.HasValue?(t?.Physical??0)-(t?.Reserved??0):(decimal?)null,
            ownReserved=productId.HasValue?mine:(decimal?)null,rackRequestable=productId.HasValue?(t?.Physical??0)-(t?.Reserved??0)+mine:(decimal?)null,
            routeDistance=route.Distances.TryGetValue(r.Id,out var distance)?distance:(double?)null
        };});
        var term=search?.Trim()??"";options=options.Where(x=>(!query.RackId.HasValue||x.Id==query.RackId)&&(term.Length==0||x.Name.Contains(term,StringComparison.OrdinalIgnoreCase)||x.Code.Contains(term,StringComparison.OrdinalIgnoreCase)));
        var ordered=query.Sort=="stock"?options.OrderByDescending(x=>x.rackRequestable).ThenBy(x=>x.Code,StringComparer.Ordinal).ThenBy(x=>x.Id):options.OrderBy(x=>x.routeDistance??double.PositiveInfinity).ThenBy(x=>x.Code,StringComparer.Ordinal).ThenBy(x=>x.Id);
        var candidates=ordered.Where(x=>x.rackRequestable>0&&(query.Sort=="stock"||x.routeDistance.HasValue));
        var recommended=productId.HasValue&&!query.ShipmentId.HasValue?(query.Sort=="route"?candidates.FirstOrDefault(x=>x.rackRequestable>=query.Quantity)??candidates.FirstOrDefault():candidates.FirstOrDefault()):null;
        return new {recommendedRack=recommended,routeStatus=route.Status,disconnectedAisles=route.DisconnectedAisles,unreachableRackIds=route.UnreachableRackIds,items=ordered.Skip((page-1)*30).Take(30).ToArray(),total=options.Count(),page,pageSize=30,routeNotice=route.Notice};
    }
    private sealed record RackTotal(Guid Id,decimal Physical,decimal Reserved);
}
