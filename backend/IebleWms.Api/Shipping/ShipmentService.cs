using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
namespace IebleWms.Api.Shipping;

public sealed partial class ShipmentService(WmsDbContext db, ProductUsagePolicy productPolicy, TimeProvider clock)
{
    public async Task<object> List(Guid tenant, string? search, string status, Guid? warehouseId, DateOnly? from, DateOnly? to, int page, int pageSize, CancellationToken ct)
    {
        if (search?.Length > 100 || status is not ("all" or "Requested" or "Picking" or "Picked" or "Inspected" or "Confirmed" or "Cancelled") || page<1 || page>100000 || pageSize is not (20 or 50 or 100) || from>to) throw Error("검색 조건을 확인해 주세요.");
        var q=db.OutboundShipments.AsNoTracking().Where(x=>x.TenantId==tenant);
        if(!string.IsNullOrWhiteSpace(search)) {var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Number.ToLower().Contains(term)||x.PartnerName.ToLower().Contains(term)||db.OutboundShipmentLines.Any(l=>l.TenantId==tenant&&l.ShipmentId==x.Id&&(l.ProductName.ToLower().Contains(term)||l.ProductCode.ToLower().Contains(term))));}
        if(status!="all")q=q.Where(x=>x.Status==status);if(warehouseId.HasValue)q=q.Where(x=>x.WarehouseId==warehouseId);if(from.HasValue)q=q.Where(x=>x.ExpectedDate>=from);if(to.HasValue)q=q.Where(x=>x.ExpectedDate<=to);
        var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/(double)pageSize)));
        var shipments=await q.OrderByDescending(x=>x.ExpectedDate).ThenByDescending(x=>x.Number).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);
        var ids=shipments.Select(x=>x.Id).ToArray();var lines=await db.OutboundShipmentLines.AsNoTracking().Where(x=>x.TenantId==tenant&&ids.Contains(x.ShipmentId)).ToListAsync(ct);
        return new {items=shipments.Select(r=>new {shipment=r,productCount=lines.Where(l=>l.ShipmentId==r.Id).Select(l=>l.ProductId).Distinct().Count(),totals=lines.Where(l=>l.ShipmentId==r.Id).GroupBy(l=>l.Unit).Select(g=>new{unit=g.Key,quantity=g.Sum(l=>l.RequestedQuantity)})}),total,page,pageSize};
    }
    public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,int page,CancellationToken ct,string? exactName=null,string? exactUnit=null,IebleWms.Api.Products.ProductSelectionQuery? selection=null,Guid? productId=null,ShipmentRackQuery? rackQuery=null)
    {
        if(kind=="racks") return await RackChoices(tenant,warehouseId,productId,search,page,rackQuery??new(),ct);
        if(kind=="product-options") return await IebleWms.Api.Products.DocumentProductSelection.Options(db,tenant,ct);
        if(kind=="product-table") return await IebleWms.Api.Products.DocumentProductSelection.List(db,tenant,search,page,selection??new(),warehouseId,ActiveLocations(tenant,warehouseId??Guid.Empty),ct);
        if(search?.Length>100||page<1||page>100000||exactName?.Length>200||exactUnit?.Length>16||(exactName!=null&&string.IsNullOrWhiteSpace(exactName))||(exactUnit!=null&&string.IsNullOrWhiteSpace(exactUnit))||((exactName!=null||exactUnit!=null)&&kind!="products"))throw Error("조회 조건을 확인해 주세요.");
        var term=search?.Trim().ToLowerInvariant()??"";
        IQueryable<Choice> q=kind switch {
            "products"=>db.Products.Where(x=>x.TenantId==tenant&&x.IsActive).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name,ModelNumber=x.ModelNumber,RetailPrice=x.RetailPrice,Currency=x.Currency,Unit=x.Unit,LotManaged=x.LotManaged,ExpiryManaged=x.ExpiryManaged,SerialManaged=x.SerialManaged }),
            "partners"=>db.Partners.Where(x=>x.TenantId==tenant&&x.IsActive&&(x.Type=="CUSTOMER"||x.Type=="BOTH")).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name }),
            "warehouses"=>db.Warehouses.Where(x=>x.TenantId==tenant&&x.IsActive).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=x.CustomCode }),
            "locations"=>ActiveLocations(tenant,warehouseId??Guid.Empty).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name }),
            _=>throw Error("조회 항목을 확인해 주세요.")
        };
        if(term!="")q=q.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.CustomCode!=null&&x.CustomCode.ToLower().Contains(term)));
        if(exactName!=null)q=q.Where(x=>x.Name==exactName);
        if(exactUnit!=null)q=q.Where(x=>x.Unit==exactUnit);
        var total=await q.CountAsync(ct);var ordered=q.OrderBy(x=>x.Code).ThenBy(x=>x.Id);return new {items=await ordered.Skip((page-1)*30).Take(30).ToListAsync(ct),total,page,pageSize=30};
    }
    public sealed class Choice { public string? CustomCode { get; set; } public bool HasStock { get; set; } public decimal? RetailPrice { get; set; } public string? Currency { get; set; } public string? ModelNumber { get; set; } public Guid Id { get; set; } public string Code { get; set; } = ""; public string Name { get; set; } = ""; public string? Unit { get; set; } public bool LotManaged { get; set; } public bool ExpiryManaged { get; set; } public bool SerialManaged { get; set; } }
    public async Task<object> Detail(Guid tenant,Guid id,CancellationToken ct)
    {
        var shipment=await Find(tenant,id,ct);var lines=await Lines(tenant,id,ct);var allocations=await Allocations(tenant,lines,ct);
        // Allocation codes are the reserved/picked location snapshot; never substitute the planned rack.
        var stockIds=allocations.Select(a=>a.StockId).Distinct().ToArray();
        var stockLocations=await (from stock in db.StockBalances.AsNoTracking() where stock.TenantId==tenant&&stockIds.Contains(stock.Id)
            join location in db.StorageLocations.IgnoreQueryFilters() on new{stock.TenantId,stock.WarehouseId,Id=stock.LocationId} equals new{location.TenantId,location.WarehouseId,location.Id}
            select new{stock.Id,stock.LocationId,stock.WarehouseId,location.Code,location.RackId,RackCode=db.WarehouseRacks.IgnoreQueryFilters().Where(r=>r.TenantId==tenant&&r.Id==location.RackId).Select(r=>r.Code).FirstOrDefault()}).ToDictionaryAsync(s=>s.Id,ct);
        var actorIds=allocations.Where(a=>a.PickedByUserId.HasValue).Select(a=>a.PickedByUserId!.Value).Distinct().ToArray();
        var actors=await db.Users.Where(u=>actorIds.Contains(u.Id)).Select(u=>new{u.Id,u.DisplayName}).ToDictionaryAsync(u=>u.Id,ct);
        foreach(var a in allocations){
            a.WarehouseId=a.SourceWarehouseId??shipment.WarehouseId;a.WarehouseName=shipment.WarehouseName;
            a.LocationId=a.SourceLocationId;a.RackId=a.SourceRackId;
            // Older records keep their existing code snapshots. Resolve IDs only when identity still matches.
            if(!a.SourceLocationId.HasValue&&stockLocations.TryGetValue(a.StockId,out var stock)&&stock.WarehouseId==shipment.WarehouseId&&stock.Code==a.LocationCode&&stock.RackCode==a.RackCode){a.LocationId=stock.LocationId;a.RackId=stock.RackId;}
            a.PickedByName=a.PickedByUserId.HasValue&&actors.TryGetValue(a.PickedByUserId.Value,out var actor)?actor.DisplayName:null;
        }
        var movements=await db.StockMovements.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ShipmentId==id).ToListAsync(ct);
        return new {shipment,lines,allocations,movements};
    }
    public async Task<object> Stock(Guid tenant,Guid warehouse,Guid product,int page,CancellationToken ct)
    {
        if(page<1||page>100000)throw Error("페이지를 확인해 주세요.");
        var q=db.StockBalances.AsNoTracking().Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.ProductId==product);
        var physical=db.Database.IsNpgsql()?await q.SumAsync(x=>x.Quantity,ct):(decimal)await q.SumAsync(x=>(double)x.Quantity,ct);
        var reserved=db.Database.IsNpgsql()?await q.SumAsync(x=>x.ReservedQuantity,ct):(decimal)await q.SumAsync(x=>(double)x.ReservedQuantity,ct);
        var available=q.Where(x=>x.Quantity>0);var total=await available.CountAsync(ct);
        var activeLocations=ActiveLocations(tenant,warehouse);
        var items=await (from s in available join l in db.StorageLocations on new{s.TenantId,s.WarehouseId,Id=s.LocationId} equals new{l.TenantId,l.WarehouseId,l.Id}
            orderby l.Code,s.ExpiryDate,s.Id select new {s.Id,s.Unit,s.LotNumber,s.ExpiryDate,s.SerialNumber,s.Quantity,s.ReservedQuantity,availableQuantity=s.Quantity-s.ReservedQuantity,locationCode=l.Code,isActive=activeLocations.Any(active=>active.Id==l.Id)})
            .Skip((page-1)*30).Take(30).ToListAsync(ct);
        return new {physical=decimal.Round(physical,3),reserved=decimal.Round(reserved,3),available=decimal.Round(physical-reserved,3),items,total,page};
    }
    public async Task<object> SaveShipment(Guid tenant,Guid actor,Guid? id,ShipmentRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r))));
        if(!id.HasValue) {
            if(r.RequestId==Guid.Empty)throw Error("등록 요청 번호를 확인해 주세요.");
            var replay=await db.OutboundShipments.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);
            if(replay!=null){if(replay.RequestHash!=hash)throw Error("등록 요청 내용이 달라졌습니다. 기존 출고를 확인해 주세요.",409);await tx.CommitAsync(ct);return await Detail(tenant,replay.Id,ct);}
        }
        var doc=id.HasValue?await Find(tenant,id.Value,ct):new OutboundShipment{TenantId=tenant,RequestId=r.RequestId,RequestHash=hash,Number=await IebleWms.Api.Services.BusinessCodes.Next(db,tenant,"PK",ct)};
        if(id.HasValue){Version(doc,r.Version);State(doc,"Requested");}
        var old=id.HasValue?await Lines(tenant,doc.Id,ct):[];var oldAlloc=await Allocations(tenant,old,ct);var before=Snapshot(doc,old,oldAlloc);
        var assignee = await BusinessAssignees.Resolve(db,tenant,actor,r.ContactUserId,!id.HasValue,doc.ContactUserId,doc.ContactName,ct);
        doc.ContactUserId = assignee.Id;
        if(r.RequestDate==default||r.ExpectedDate==default||r.ExpectedDate<r.RequestDate||string.IsNullOrWhiteSpace(assignee.Name)||assignee.Name.Length>200||r.Notes?.Length>2000||r.Lines is null||r.Lines.Length <1)throw Error("요청일·예정일·담당자·출고 상품을 확인해 주세요.");
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.WarehouseId&&x.IsActive,ct)??throw Error("사용 가능한 창고를 선택해 주세요.");
        var partner=await db.Partners.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.PartnerId&&x.IsActive&&(x.Type=="CUSTOMER"||x.Type=="BOTH"),ct)??throw Error("사용 가능한 매출처를 선택해 주세요.");
        doc.RequestDate=r.RequestDate;doc.ExpectedDate=r.ExpectedDate;doc.WarehouseId=warehouse.Id;doc.WarehouseName=warehouse.Name;doc.PartnerId=partner.Id;doc.PartnerName=partner.Name;doc.ContactName=assignee.Name.Trim();doc.Notes=r.Notes?.Trim();
        // The whole release/reallocation is one transaction. Failed edits retain prior reservations.
        await Release(tenant,oldAlloc,false,ct);
        db.ShipmentAllocations.RemoveRange(oldAlloc);db.OutboundShipmentLines.RemoveRange(old);
        if(!id.HasValue)db.OutboundShipments.Add(doc);
        var products=new Dictionary<Guid,Product>();
        foreach(var productId in r.Lines.Select(x=>x.ProductId).Distinct().OrderBy(x=>x))products[productId]=await productPolicy.LockForInventory(tenant,productId,ct);
        var rackIds=r.Lines.Where(x=>x.PlannedRackId.HasValue).Select(x=>x.PlannedRackId!.Value).Distinct().ToArray();
        var racks=await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse.Id&&rackIds.Contains(x.Id)&&x.IsActive&&(x.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse.Id&&z.Id==x.ZoneId&&z.IsActive))).ToDictionaryAsync(x=>x.Id,ct);
        if(racks.Count!=rackIds.Length)throw Error("현재 출고 창고의 활성 지정 랙을 선택해 주세요.");
        var lines=new List<OutboundShipmentLine>();var allocations=new List<ShipmentAllocation>();
        foreach(var input in r.Lines) {
            var p=products[input.ProductId];Quantity(input.RequestedQuantity,false);
            var serials=input.Serials?.Select(x=>x?.Trim()??"").ToArray()??throw Error("시리얼을 확인해 주세요.");
            if(serials.Length>1000||serials.Any(x=>x.Length is <1 or >100||x.Any(char.IsControl))||serials.Distinct().Count()!=serials.Length||(serials.Length>0&&serials.Length!=input.RequestedQuantity))throw Error("시리얼 관리 상품은 정수 수량이며, 지정한 시리얼 개수는 요청 수량과 일치해야 합니다.");
            var lot=string.IsNullOrWhiteSpace(input.LotNumber)?null:input.LotNumber.Trim();if(lot?.Length>100||lot?.Any(char.IsControl)==true||input.ExpiryDate==default(DateOnly))throw Error("LOT·유통기한을 확인해 주세요.");
            IebleWms.Api.Products.ProductPackaging.ValidateEach(input.RequestedQuantity,p.Unit);
            var l=new OutboundShipmentLine{TenantId=tenant,ShipmentId=doc.Id,ProductId=p.Id,PlannedRackId=input.PlannedRackId,PlannedRackWarehouseId=input.PlannedRackId.HasValue?warehouse.Id:null,Position=lines.Count,ProductCode=p.Code,ProductName=p.Name,Unit=p.Unit,BarcodeSnapshotJson=await IebleWms.Api.Products.ProductPackaging.Capture(db,tenant,p,ct),LotManaged=lot!=null,ExpiryManaged=input.ExpiryDate.HasValue,SerialManaged=serials.Length>0,RequestedQuantity=input.RequestedQuantity,LotNumber=lot,ExpiryDate=input.ExpiryDate,Serials=serials};lines.Add(l);
            // Prefer the requested rack, then preserve the existing location/expiry order across the same warehouse.
            var candidates=await (from s in db.StockBalances where s.TenantId==tenant&&s.WarehouseId==warehouse.Id&&s.ProductId==p.Id&&s.Unit==p.Unit&&s.Quantity>0
                join loc in ActiveLocations(tenant,warehouse.Id) on s.LocationId equals loc.Id
                where (lot==null||s.LotNumber==lot)&&(!input.ExpiryDate.HasValue||s.ExpiryDate==input.ExpiryDate)&&(serials.Length==0||(s.SerialNumber!=null&&serials.Contains(s.SerialNumber)))
                orderby (input.PlannedRackId.HasValue&&loc.RackId==input.PlannedRackId) descending,loc.Code,s.ExpiryDate,s.Id select new {stock=s,location=loc}).ToListAsync(ct);
            var remaining=input.RequestedQuantity;
            foreach(var candidate in candidates) {
                var s=candidate.stock;var take=Math.Min(remaining,s.Quantity-s.ReservedQuantity);if(take<=0)continue;
                if(s.SerialNumber!=null){if(s.Quantity!=1||s.ReservedQuantity is not (0 or 1))throw Error("기존 시리얼 재고의 수량이 올바르지 않습니다.",409);if(take<1)continue;take=1;}
                s.ReservedQuantity+=take;remaining-=take;
                var rackCode=candidate.location.RackId.HasValue?await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse.Id&&x.Id==candidate.location.RackId).Select(x=>x.Code).SingleAsync(ct):null;
                allocations.Add(new(){TenantId=tenant,LineId=l.Id,StockId=s.Id,SourceWarehouseId=warehouse.Id,SourceLocationId=candidate.location.Id,SourceRackId=candidate.location.RackId,Quantity=take,LocationCode=candidate.location.Code,RackCode=rackCode,LotNumber=s.LotNumber,ExpiryDate=s.ExpiryDate,SerialNumber=s.SerialNumber});if(remaining==0)break;
            }
            if(remaining>0)throw Error($"{p.Name}: 출고 가능한 재고가 {remaining} {p.Unit} 부족합니다. 위치 사용 여부와 LOT·시리얼 조건을 확인해 주세요.",409);
        }
        if(allocations.Count>10000)throw Error("출고 위치 항목은 문서당 최대 10,000개입니다.");
        db.OutboundShipmentLines.AddRange(lines);db.ShipmentAllocations.AddRange(allocations);Audit(doc,actor,id.HasValue?"Updated":"Reserved",before,lines,allocations);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,doc.Id,ct);
    }
    public async Task<object> Transition(Guid tenant,Guid actor,Guid id,ShipmentVersionRequest r,bool cancel,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);
        if(cancel&&doc.Status=="Cancelled"){await tx.CommitAsync(ct);return await Detail(tenant,id,ct);}
        Version(doc,r.Version);State(doc,"Requested","Picking");var lines=await Lines(tenant,id,ct);var allocations=await Allocations(tenant,lines,ct);var before=Snapshot(doc,lines,allocations);
        if(cancel){if(allocations.Any(x=>x.PickedQuantity>0))throw Error("피킹 기록이 있는 출고는 취소할 수 없습니다.",409);await Release(tenant,allocations,false,ct);doc.Status="Cancelled";}
        else{State(doc,"Requested");doc.Status="Picking";}
        Audit(doc,actor,cancel?"Cancelled":"PickingStarted",before,lines,allocations);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    public async Task<object> Work(Guid tenant,Guid actor,Guid id,ShipmentWorkRequest r,bool inspect,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);var lines=await Lines(tenant,id,ct);var allocations=await Allocations(tenant,lines,ct);
        if(r.Allocations is null||r.Allocations.Length!=allocations.Count||r.Allocations.Select(x=>x.AllocationId).Distinct().Count()!=allocations.Count||r.Allocations.Any(x=>allocations.All(a=>a.Id!=x.AllocationId)))throw Error("위치별 작업 항목을 모두 확인해 주세요.");
        // Absolute quantities, never increments. A lost-response replay cannot add picked stock.
        if(r.Complete&&doc.Status==(inspect?"Inspected":"Picked")&&r.Allocations.All(x=>x.Quantity==allocations.Single(a=>a.Id==x.AllocationId).Quantity)){await tx.CommitAsync(ct);return await Detail(tenant,id,ct);}
        Version(doc,r.Version);State(doc,inspect?"Picked":"Picking");await CaptureSourceLocations(tenant,doc,allocations,await LoadStocks(tenant,allocations,ct),ct);var before=Snapshot(doc,lines,allocations);
        foreach(var input in r.Allocations){var a=allocations.Single(x=>x.Id==input.AllocationId);Quantity(input.Quantity,true);IebleWms.Api.Products.ProductPackaging.ValidateEach(input.Quantity,lines.Single(l=>l.Id==a.LineId).Unit);if(a.SerialNumber!=null&&input.Quantity is not (0 or 1))throw Error("시리얼 재고의 피킹·검수 수량은 0 또는 1이어야 합니다.");if(a.State!="Active"||input.Quantity>(inspect?a.PickedQuantity:a.Quantity)||(r.Complete&&input.Quantity!=a.Quantity))throw Error("요청·예약·피킹·검수 수량이 일치해야 완료할 수 있습니다.");
            if(inspect){a.InspectedQuantity=input.Quantity;a.InspectedByUserId=actor;a.InspectedAt=clock.GetUtcNow();}else{if(input.Quantity<a.PickedQuantity)throw Error("이미 기록한 피킹 수량은 줄일 수 없습니다.");a.PickedQuantity=input.Quantity;a.PickedByUserId=actor;a.PickedAt=clock.GetUtcNow();}}
        if(r.Complete){doc.Status=inspect?"Inspected":"Picked";if(inspect){doc.InspectedAt=clock.GetUtcNow();doc.InspectedByUserId=actor;}else{doc.PickedAt=clock.GetUtcNow();doc.PickedByUserId=actor;}}
        Audit(doc,actor,inspect?(r.Complete?"Inspected":"InspectionSaved"):(r.Complete?"Picked":"PickingSaved"),before,lines,allocations);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    public async Task<object> Confirm(Guid tenant,Guid actor,Guid id,ShipmentVersionRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);
        if(doc.Status=="Confirmed"){await tx.CommitAsync(ct);return await Detail(tenant,id,ct);}
        Version(doc,r.Version);State(doc,"Inspected");var lines=await Lines(tenant,id,ct);var allocations=await Allocations(tenant,lines,ct);var before=Snapshot(doc,lines,allocations);
        if(doc.PickedAt==null||doc.InspectedAt==null||lines.Count==0||allocations.Any(a=>a.State!="Active"||a.PickedQuantity!=a.Quantity||a.InspectedQuantity!=a.Quantity)||lines.Any(l=>allocations.Where(a=>a.LineId==l.Id).Sum(a=>a.Quantity)!=l.RequestedQuantity))throw Error("요청·예약·피킹·검수를 모두 완료해 주세요.",409);
        var stocks=await LoadStocks(tenant,allocations,ct);
        await CaptureSourceLocations(tenant,doc,allocations,stocks,ct);
        foreach(var a in allocations){var s=stocks[a.StockId];var l=lines.Single(x=>x.Id==a.LineId);if(s.WarehouseId!=doc.WarehouseId||s.ProductId!=l.ProductId||s.Unit!=l.Unit||s.LotNumber!=a.LotNumber||s.ExpiryDate!=a.ExpiryDate||s.SerialNumber!=a.SerialNumber)throw Error("예약 재고의 추적 정보가 변경되었습니다.",409);}
        await Release(tenant,allocations,true,ct);
        foreach(var g in allocations.GroupBy(x=>x.StockId))db.StockMovements.Add(new(){TenantId=tenant,StockId=g.Key,ShipmentId=id,Type="ShipmentConfirmed",Quantity=-g.Sum(x=>x.Quantity),ActorId=actor,CreatedAt=clock.GetUtcNow()});
        doc.Status="Confirmed";doc.ConfirmedAt=clock.GetUtcNow();doc.ConfirmedByUserId=actor;Audit(doc,actor,"Confirmed",before,lines,allocations);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    async Task CaptureSourceLocations(Guid tenant,OutboundShipment doc,List<ShipmentAllocation> allocations,Dictionary<Guid,StockBalance> stocks,CancellationToken ct)
    {
        var ids=stocks.Values.Select(s=>s.LocationId).Distinct().ToArray();
        var locations=await db.StorageLocations.Where(l=>l.TenantId==tenant&&l.WarehouseId==doc.WarehouseId&&ids.Contains(l.Id)).Select(l=>new{l.Id,l.RackId,l.Code,RackCode=db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.Id==l.RackId).Select(r=>r.Code).FirstOrDefault()}).ToDictionaryAsync(l=>l.Id,ct);
        foreach(var a in allocations){var stock=stocks[a.StockId];
            if(stock.WarehouseId!=doc.WarehouseId||!locations.TryGetValue(stock.LocationId,out var location))throw Error("예약 재고의 출고 위치가 변경되었습니다.",409);
            if(a.SourceLocationId.HasValue){if(a.SourceWarehouseId!=stock.WarehouseId||a.SourceLocationId!=stock.LocationId||a.SourceRackId!=location.RackId)throw Error("예약한 창고·랙·보관 위치가 변경되었습니다. 출고 위치를 재확인해 주세요.",409);}
            else {if(a.LocationCode!=location.Code||a.RackCode!=location.RackCode)throw Error("기존 예약 위치와 현재 재고 위치가 다릅니다. 출고 위치를 재확인해 주세요.",409);a.SourceWarehouseId=stock.WarehouseId;a.SourceLocationId=stock.LocationId;a.SourceRackId=location.RackId;}
        }
    }
    async Task<Dictionary<Guid,StockBalance>> LoadStocks(Guid tenant,List<ShipmentAllocation> allocations,CancellationToken ct){var ids=allocations.Select(x=>x.StockId).Distinct().ToArray();var rows=await db.StockBalances.Where(x=>x.TenantId==tenant&&ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,ct);if(rows.Count!=ids.Length)throw Error("예약 재고를 찾을 수 없습니다.",409);return rows;}
    async Task Release(Guid tenant,List<ShipmentAllocation> allocations,bool consume,CancellationToken ct)
    {
        var stocks=await LoadStocks(tenant,allocations,ct);
        foreach(var g in allocations.GroupBy(x=>x.StockId)){var s=stocks[g.Key];var quantity=g.Sum(x=>x.Quantity);if(g.Any(x=>x.State!="Active")||s.ReservedQuantity<quantity||s.Quantity<quantity)throw Error("예약 수량이 일치하지 않습니다. 다시 조회해 주세요.",409);s.ReservedQuantity-=quantity;if(consume)s.Quantity-=quantity;}
        foreach(var a in allocations)a.State=consume?"Consumed":"Released";
    }
    IQueryable<StorageLocation> ActiveLocations(Guid tenant,Guid warehouse)=>db.StorageLocations.Where(l=>l.TenantId==tenant&&l.WarehouseId==warehouse&&l.IsActive&&db.Warehouses.Any(w=>w.TenantId==tenant&&w.Id==warehouse&&w.IsActive)&&(l.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse&&z.Id==l.ZoneId&&z.IsActive))&&(l.RackId==null||db.WarehouseRacks.Any(r=>r.TenantId==tenant&&r.WarehouseId==warehouse&&r.Id==l.RackId&&r.IsActive&&(r.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse&&z.Id==r.ZoneId&&z.IsActive)))));
    static void Quantity(decimal quantity,bool zero){if(quantity<(zero?0:0.001m)||quantity>999999999.999m||decimal.Round(quantity,3)!=quantity)throw Error("수량은 소수점 3자리 이내로 입력해 주세요.");}
    async Task<OutboundShipment> Find(Guid tenant,Guid id,CancellationToken ct)=>await db.OutboundShipments.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error("출고 문서를 찾을 수 없습니다.",404);
    async Task<List<OutboundShipmentLine>> Lines(Guid tenant,Guid id,CancellationToken ct)
    {
        var lines=await db.OutboundShipmentLines.Where(x=>x.TenantId==tenant&&x.ShipmentId==id).OrderBy(x=>x.Position).ToListAsync(ct);
        var ids=lines.Select(x=>x.ProductId).Distinct().ToArray();
        var products=await db.Products.Where(x=>x.TenantId==tenant&&ids.Contains(x.Id)).Select(x=>new{x.Id,x.RetailPrice,x.Currency}).ToDictionaryAsync(x=>x.Id,ct);
        var rackIds=lines.Select(x=>x.PlannedRackId).ToArray();
        var racks=await db.WarehouseRacks.IgnoreQueryFilters().Where(x=>x.TenantId==tenant&&rackIds.Contains(x.Id)).Select(x=>new{x.Id,x.WarehouseId,x.Code,x.Name}).ToListAsync(ct);
        foreach(var line in lines){if(products.TryGetValue(line.ProductId,out var product)){line.RetailPrice=product.RetailPrice;line.Currency=product.Currency;}var rack=racks.FirstOrDefault(x=>x.Id==line.PlannedRackId&&x.WarehouseId==line.PlannedRackWarehouseId);line.PlannedRackName=rack?.Name;line.PlannedRackCode=rack?.Code;}
        return lines;
    }
    Task<List<ShipmentAllocation>> Allocations(Guid tenant,List<OutboundShipmentLine> lines,CancellationToken ct){var ids=lines.Select(x=>x.Id).ToArray();return db.ShipmentAllocations.Where(x=>x.TenantId==tenant&&ids.Contains(x.LineId)).OrderBy(x=>x.LocationCode).ThenBy(x=>x.Id).ToListAsync(ct);}
    static void Version(OutboundShipment doc,Guid version){if(version==Guid.Empty||doc.Version!=version)throw Error("다른 사용자가 출고를 변경했습니다. 상세를 다시 열어 주세요.",409);}
    static void State(OutboundShipment doc,params string[] allowed){if(!allowed.Contains(doc.Status))throw Error("현재 출고 상태에서는 처리할 수 없습니다.",409);}
    // All shipping inventory writes share a tenant transaction lock. Stock versions and
    // Q >= R >= 0 constraints additionally reject conflicting writes from other workflows.
    Task<IDbContextTransaction> Begin(Guid tenant,CancellationToken ct)=>IebleWms.Api.Inventory.InventoryTransactions.Begin(db,tenant,ct);
    async Task Save(CancellationToken ct){try{await db.SaveChangesAsync(ct);}catch(DbUpdateConcurrencyException){throw Error("재고 또는 출고가 변경되었습니다. 다시 조회해 주세요.",409);}catch(DbUpdateException){throw Error("재고 수량·출고번호 또는 참조 정보 충돌로 저장하지 못했습니다.",409);}}
    static object Snapshot(OutboundShipment doc,List<OutboundShipmentLine> lines,List<ShipmentAllocation> allocations)=>JsonSerializer.SerializeToElement(new{shipment=doc,lines,allocations});
    ShipmentChange Audit(OutboundShipment doc,Guid actor,string action,object before,List<OutboundShipmentLine> lines,List<ShipmentAllocation> allocations)
    {
        if(db.Entry(doc).State!=EntityState.Added)db.Entry(doc).Property(x=>x.UpdatedAt).IsModified=true;
        var change=new ShipmentChange{TenantId=doc.TenantId,ShipmentId=doc.Id,ActorId=actor,Action=action,CreatedAt=clock.GetUtcNow(),BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(Snapshot(doc,lines,allocations))};
        db.ShipmentChanges.Add(change);return change;
    }
    static OrganizationException Error(string message,int status=400)=>new(status,message);
}
