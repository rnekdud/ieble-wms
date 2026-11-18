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
namespace IebleWms.Api.Receiving;

public sealed partial class ReceiptService(WmsDbContext db, ProductUsagePolicy productPolicy, TimeProvider clock)
{
    public async Task<object> List(Guid tenant, string? search, string status, Guid? warehouseId, DateOnly? from, DateOnly? to, int page, int pageSize, CancellationToken ct)
    {
        if (search?.Length > 100 || status is not ("all" or "Planned" or "Inspecting" or "Confirmed" or "Cancelled") || page<1 || page>100000 || pageSize is not (20 or 50 or 100) || from>to) throw Error("검색 조건을 확인해 주세요.");
        var q=db.InboundReceipts.AsNoTracking().Where(x=>x.TenantId==tenant);
        if(!string.IsNullOrWhiteSpace(search)) {var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Number.ToLower().Contains(term)||x.PartnerName.ToLower().Contains(term)||db.InboundReceiptLines.Any(l=>l.TenantId==tenant&&l.ReceiptId==x.Id&&(l.ProductName.ToLower().Contains(term)||l.ProductCode.ToLower().Contains(term))));}
        if(status!="all")q=q.Where(x=>x.Status==status);if(warehouseId.HasValue)q=q.Where(x=>x.WarehouseId==warehouseId);if(from.HasValue)q=q.Where(x=>x.ExpectedDate>=from);if(to.HasValue)q=q.Where(x=>x.ExpectedDate<=to);
        var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/(double)pageSize)));
        var receipts=await q.OrderByDescending(x=>x.ExpectedDate).ThenByDescending(x=>x.Number).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);
        var ids=receipts.Select(x=>x.Id).ToArray();var lines=await db.InboundReceiptLines.AsNoTracking().Where(x=>x.TenantId==tenant&&ids.Contains(x.ReceiptId)).ToListAsync(ct);
        return new {items=receipts.Select(r=>new {receipt=r,productCount=lines.Where(l=>l.ReceiptId==r.Id).Select(l=>l.ProductId).Distinct().Count(),totals=lines.Where(l=>l.ReceiptId==r.Id).GroupBy(l=>l.Unit).Select(g=>new{unit=g.Key,quantity=g.Sum(l=>l.ExpectedQuantity)})}),total,page,pageSize};
    }
    public async Task<object> Detail(Guid tenant,Guid id,CancellationToken ct)
    {
        var receipt=await Find(tenant,id,ct);var lines=await Lines(tenant,id,ct);
        return new {receipt,lines};
    }
    public async Task<object> Stock(Guid tenant,Guid id,CancellationToken ct)
    {
        await Find(tenant,id,ct);
        var lineIds=await db.InboundReceiptLines.Where(x=>x.TenantId==tenant&&x.ReceiptId==id).Select(x=>x.Id).ToListAsync(ct);
        return new {balances=await db.StockBalances.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ReceiptLineId.HasValue&&lineIds.Contains(x.ReceiptLineId.Value)).ToListAsync(ct),movements=await db.StockMovements.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ReceiptId==id).ToListAsync(ct)};
    }
    public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,int page,CancellationToken ct,string? exactName=null,string? exactUnit=null,IebleWms.Api.Products.ProductSelectionQuery? selection=null,Guid? preferredRackId=null)
    {
        if(kind=="product-options") return await IebleWms.Api.Products.DocumentProductSelection.Options(db,tenant,ct);
        if(kind=="product-table") return await IebleWms.Api.Products.DocumentProductSelection.List(db,tenant,search,page,selection??new(),warehouseId,null,ct);
        if(search?.Length>100||page<1||page>100000||exactName?.Length>200||exactUnit?.Length>16||(exactName!=null&&string.IsNullOrWhiteSpace(exactName))||(exactUnit!=null&&string.IsNullOrWhiteSpace(exactUnit))||((exactName!=null||exactUnit!=null)&&kind!="products"))throw Error("조회 조건을 확인해 주세요.");
        var term=search?.Trim().ToLowerInvariant()??"";
        var businessTerm=term.Replace("-", "").Replace(" ", "");
        IQueryable<Choice> q=kind switch {
            "products"=>db.Products.Where(x=>x.TenantId==tenant&&x.IsActive&&(term==""||x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.ModelNumber!=null&&x.ModelNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.Id&&b.Value.ToLower().Contains(term)))).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name,ModelNumber=x.ModelNumber,RetailPrice=x.RetailPrice,Currency=x.Currency,Unit=x.Unit,LotManaged=x.LotManaged,ExpiryManaged=x.ExpiryManaged,SerialManaged=x.SerialManaged }),
            "partners"=>db.Partners.Where(x=>x.TenantId==tenant&&x.IsActive&&(x.Type=="SUPPLIER"||x.Type=="BOTH")&&(term==""||x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(businessTerm!=""&&x.NormalizedBusinessNumber!=null&&x.NormalizedBusinessNumber.ToLower().Contains(businessTerm)))).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name }),
            "warehouses"=>db.Warehouses.Where(x=>x.TenantId==tenant&&x.IsActive).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=x.CustomCode }),
            "racks"=>ActiveRacks(tenant,warehouseId??Guid.Empty).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name }),
            "locations"=>ActiveLocations(tenant,warehouseId??Guid.Empty).Select(x=>new Choice { Id=x.Id,Code=x.Code,Name=x.Name,RackId=x.RackId,Level=x.Level,Bay=x.Bay,RackName=db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.WarehouseId==warehouseId&&r.Id==x.RackId).Select(r=>r.Name).FirstOrDefault(),RackCode=db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.WarehouseId==warehouseId&&r.Id==x.RackId).Select(r=>r.Code).FirstOrDefault() }),
            _=>throw Error("조회 항목을 확인해 주세요.")
        };
        if(term!=""&&kind=="locations")q=q.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.RackName!=null&&x.RackName.ToLower().Contains(term))||(x.RackCode!=null&&x.RackCode.ToLower().Contains(term)));
        else if(term!=""&&kind is not ("products" or "partners"))q=q.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.CustomCode!=null&&x.CustomCode.ToLower().Contains(term)));
        if(exactName!=null)q=q.Where(x=>x.Name==exactName);
        if(exactUnit!=null)q=q.Where(x=>x.Unit==exactUnit);
        var total=await q.CountAsync(ct);
        var ordered=kind=="locations"&&preferredRackId.HasValue?q.OrderByDescending(x=>x.RackId==preferredRackId).ThenBy(x=>x.Code).ThenBy(x=>x.Id):q.OrderBy(x=>x.Code).ThenBy(x=>x.Id);
        return new {items=await ordered.Skip((page-1)*30).Take(30).ToListAsync(ct),total,page,pageSize=30};
    }
    public sealed class Choice { public string? CustomCode { get; set; } public decimal? RetailPrice { get; set; } public string? Currency { get; set; } public Guid? RackId { get; set; } public string? RackName { get; set; } public string? RackCode { get; set; } public int? Level { get; set; } public int? Bay { get; set; } public string? ModelNumber { get; set; } public Guid Id { get; set; } public string Code { get; set; } = ""; public string Name { get; set; } = ""; public string? Unit { get; set; } public bool LotManaged { get; set; } public bool ExpiryManaged { get; set; } public bool SerialManaged { get; set; } }
    public async Task<object> SaveReceipt(Guid tenant,Guid actor,Guid? id,ReceiptRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r))));
        if(!id.HasValue) {
            if(r.RequestId==Guid.Empty)throw Error("등록 요청 번호를 확인해 주세요.");
            var replay=await db.InboundReceipts.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);
            if(replay!=null){if(replay.RequestHash!=hash)throw Error("등록 요청 내용이 달라졌습니다. 기존 입고 문서를 확인해 주세요.",409);await tx.CommitAsync(ct);return await Detail(tenant,replay.Id,ct);}
        }
        var doc=id.HasValue?await Find(tenant,id.Value,ct):new InboundReceipt{TenantId=tenant,RequestId=r.RequestId,RequestHash=hash,Number=await IebleWms.Api.Services.BusinessCodes.Next(db,tenant,"IN",ct)};
        if(id.HasValue){Version(doc,r.Version);State(doc,"Planned","Inspecting");if(doc.InspectedAt!=null)throw Error("검수가 확정되어 입고 상품을 변경할 수 없습니다.",409);}
        var old=id.HasValue?await Lines(tenant,doc.Id,ct):[];
        var before=Snapshot(doc,old);
        var assignee = await BusinessAssignees.Resolve(db,tenant,actor,r.ContactUserId,!id.HasValue,doc.ContactUserId,doc.ContactName,ct);
        doc.ContactUserId = assignee.Id;
        if(r.ExpectedDate==default||assignee.Name.Trim().Length==0||assignee.Name.Length>200||r.Lines.Length <1)throw Error("예정일·담당자·입고 상품을 확인해 주세요.");
        var warehouse=await db.Warehouses.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.WarehouseId&&x.IsActive,ct)??throw Error("사용 가능한 창고를 선택해 주세요.");
        var partner=await db.Partners.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.PartnerId&&x.IsActive&&(x.Type=="SUPPLIER"||x.Type=="BOTH"),ct)??throw Error("사용 가능한 매입처를 선택해 주세요.");
        doc.ExpectedDate=r.ExpectedDate;doc.WarehouseId=warehouse.Id;doc.WarehouseName=warehouse.Name;doc.PartnerId=partner.Id;doc.PartnerName=partner.Name;doc.ContactName=assignee.Name.Trim();doc.Notes=r.Notes?.Trim();doc.Status="Planned";doc.InspectedAt=null;doc.InspectedByUserId=null;
        if(!id.HasValue)db.InboundReceipts.Add(doc);
        var retained=new HashSet<Guid>();
        var products=new Dictionary<Guid,Product>();
        foreach(var productId in r.Lines.Select(x=>x.ProductId).Distinct().OrderBy(x=>x))products[productId]=await productPolicy.LockForInventory(tenant,productId,ct);
        var rackIds=r.Lines.Where(x=>x.PlannedRackId.HasValue).Select(x=>x.PlannedRackId!.Value).Distinct().ToArray();
        var racks=await ActiveRacks(tenant,warehouse.Id).Where(x=>rackIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,ct);
        if(racks.Count!=rackIds.Length)throw Error("선택한 창고에서 사용 가능한 입고 랙을 선택해 주세요.");
        var lines=new List<InboundReceiptLine>();
        foreach(var input in r.Lines) {
            var p=products[input.ProductId];Quantity(input.ExpectedQuantity,false);
            IebleWms.Api.Products.ProductPackaging.ValidateEach(input.ExpectedQuantity,p.Unit);
            var l=input.LineId.HasValue
                ? old.SingleOrDefault(x=>x.Id==input.LineId&&x.ProductId==input.ProductId)??throw Error("원본 입고 행을 확인해 주세요.")
                : old.FirstOrDefault(x=>x.ProductId==input.ProductId&&!retained.Contains(x.Id));
            if(l!=null&&!retained.Add(l.Id))throw Error("동일한 원본 입고 행이 중복되었습니다.");
            if(l?.TrackingAllocations!=null&&input.TrackingAllocations==null)throw Error("저장된 다중 추적 정보를 다시 조회한 후 수정해 주세요.",409);
            if(l==null){l=new InboundReceiptLine{TenantId=tenant,ReceiptId=doc.Id,ProductId=p.Id,LotManaged=p.LotManaged,ExpiryManaged=p.ExpiryManaged,SerialManaged=p.SerialManaged};db.InboundReceiptLines.Add(l);}
            l.Position=lines.Count;l.ProductCode=p.Code;l.ProductName=p.Name;l.Unit=p.Unit;
            l.BarcodeSnapshotJson??=await IebleWms.Api.Products.ProductPackaging.Capture(db,tenant,p,ct);
            l.ExpectedQuantity=input.ExpectedQuantity;l.InspectedQuantity=null;l.Placements=[];
            l.PlannedRackId=input.PlannedRackId;l.PlannedRackWarehouseId=input.PlannedRackId.HasValue?warehouse.Id:null;
            l.RetailPrice=p.RetailPrice;l.Currency=p.Currency;
            l.PlannedRackName=input.PlannedRackId.HasValue?racks[input.PlannedRackId.Value].Name:null;
            l.PlannedRackCode=input.PlannedRackId.HasValue?racks[input.PlannedRackId.Value].Code:null;
            l.TrackingAllocations=input.TrackingAllocations;
            if(input.TrackingAllocations!=null)ValidateTrackingAllocations(l,input.ExpectedQuantity,"예정 수량");
            else Tracking(l,input.ExpectedQuantity,input.LotNumber,input.ExpiryDate,input.Serials);
            lines.Add(l);
        }
        UniqueSerials(lines);db.InboundReceiptLines.RemoveRange(old.Where(l=>!retained.Contains(l.Id)));
        Audit(doc,actor,id.HasValue?"Updated":"Created",before,lines);
        await Save(ct);await tx.CommitAsync(ct);return new {receipt=doc,lines};
    }
    public async Task<object> Transition(Guid tenant,Guid actor,Guid id,ReceiptVersionRequest r,bool cancel,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);Version(doc,r.Version);State(doc,"Planned","Inspecting");var lines=await Lines(tenant,id,ct);var before=Snapshot(doc,lines);
        if(!cancel)State(doc,"Planned");doc.Status=cancel?"Cancelled":"Inspecting";Audit(doc,actor,cancel?"Cancelled":"InspectionStarted",before,lines);await Save(ct);await tx.CommitAsync(ct);return new {receipt=doc,lines};
    }
    public async Task<object> Inspect(Guid tenant,Guid actor,Guid id,ReceiptInspectionRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);Version(doc,r.Version);State(doc,"Inspecting");if(doc.InspectedAt!=null)throw Error("검수가 이미 확정되었습니다.",409);var lines=await Lines(tenant,id,ct);var before=Snapshot(doc,lines);
        Match(lines,r.Lines.Select(x=>x.LineId));
        if(r.Lines.Any(input=>lines.Any(l=>l.Id==input.LineId&&l.InspectedQuantity.HasValue&&l.InspectedQuantity!=input.Quantity))&&string.IsNullOrWhiteSpace(r.Reason))throw Error("검수 수량 수정 사유를 입력해 주세요.");
        foreach(var input in r.Lines){var l=lines.Single(x=>x.Id==input.LineId);Quantity(input.Quantity,true);if(input.Quantity>l.ExpectedQuantity)throw Error("예정 수량을 초과했습니다.");if(l.TrackingAllocations != null) ValidateTrackingAllocations(l,input.Quantity); else Tracking(l,input.Quantity,input.LotNumber,input.ExpiryDate,input.Serials);l.InspectedQuantity=input.Quantity;l.Placements=[];}
        if(lines.Any(l=>l.TrackingAllocations!=null))await ValidateTrackingSerials(tenant,lines,ct);else UniqueSerials(lines);doc.InspectedAt=clock.GetUtcNow();doc.InspectedByUserId=actor;Audit(doc,actor,"Inspected",before,lines).Reason=r.Reason?.Trim()??"수동 검수 완료";await Save(ct);await tx.CommitAsync(ct);return new {receipt=doc,lines};
    }
    public async Task<object> Place(Guid tenant,Guid actor,Guid id,ReceiptPlacementRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);Version(doc,r.Version);State(doc,"Inspecting");if(doc.InspectedAt==null)throw Error("검수를 먼저 완료해 주세요.");var lines=await Lines(tenant,id,ct);var before=Snapshot(doc,lines);Match(lines,r.Lines.Select(x=>x.LineId));
        foreach(var input in r.Lines)lines.Single(x=>x.Id==input.LineId).Placements=input.Placements;
        await ValidatePlacement(doc,lines,ct);Audit(doc,actor,"Placed",before,lines);await Save(ct);await tx.CommitAsync(ct);return new {receipt=doc,lines};
    }
    public async Task<object> Confirm(Guid tenant,Guid actor,Guid id,ReceiptVersionRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);
        // Committed confirmations are idempotent even when the original response was lost.
        if(doc.Status=="Confirmed"){await tx.CommitAsync(ct);return await Detail(tenant,id,ct);}
        Version(doc,r.Version);State(doc,"Inspecting");if(doc.InspectedAt==null)throw Error("검수를 완료해 주세요.");var lines=await Lines(tenant,id,ct);var before=Snapshot(doc,lines);
        if(!lines.Any(x=>x.InspectedQuantity>0))throw Error("확정할 검수 수량이 없습니다.");
        if(!await db.Partners.AnyAsync(x=>x.TenantId==tenant&&x.Id==doc.PartnerId&&x.IsActive&&(x.Type=="SUPPLIER"||x.Type=="BOTH"),ct))throw Error("매입처의 사용 여부·유형을 확인해 주세요.");
        foreach(var productId in lines.Select(x=>x.ProductId).Distinct().OrderBy(x=>x)) {
            var product=await productPolicy.LockForInventory(tenant,productId,ct);
            if(lines.Any(l=>l.ProductId==productId&&(l.Unit!=product.Unit)))throw Error("상품의 추적 기준이 변경되었습니다.",409);
        }
        foreach(var l in lines) { var quantity=l.InspectedQuantity??throw Error("검수 수량을 입력해 주세요."); if(l.TrackingAllocations != null) ValidateTrackingAllocations(l,quantity); else Tracking(l,quantity,l.LotNumber,l.ExpiryDate,l.Serials); }
        UniqueSerials(lines);await ValidatePlacement(doc,lines,ct);
        foreach(var l in lines) {
            var serials=l.Serials;
            if(serials.Length>0&&await db.StockBalances.AnyAsync(x=>x.TenantId==tenant&&x.ProductId==l.ProductId&&x.SerialNumber!=null&&serials.Contains(x.SerialNumber),ct))throw Error("이미 입고된 상품 시리얼 번호가 있습니다.",409);
            var ordinal=0;
            foreach(var placement in l.Placements) {
                var allocation=l.TrackingAllocations?.SingleOrDefault(a=>a.Id==placement.TrackingId);
                var lot=l.TrackingAllocations==null?l.LotNumber:allocation?.LotNumber;
                var expiry=l.TrackingAllocations==null?l.ExpiryDate:allocation?.ExpiryDate;
                var units=placement.Serials.Select(s=>(serial:(string?)s,qty:1m)).ToList();
                if(placement.Quantity>placement.Serials.Length)units.Add((null,placement.Quantity-placement.Serials.Length));
                foreach(var unit in units){var stock=new StockBalance{TenantId=tenant,WarehouseId=doc.WarehouseId,LocationId=placement.LocationId,ProductId=l.ProductId,ReceiptLineId=l.Id,SourceKey=$"{l.Id:N}:{ordinal++}",Unit=l.Unit,LotNumber=lot,ExpiryDate=expiry,SerialNumber=unit.serial,Quantity=unit.qty};db.StockBalances.Add(stock);db.StockMovements.Add(new(){TenantId=tenant,StockId=stock.Id,ReceiptId=id,Quantity=unit.qty,ActorId=actor,CreatedAt=clock.GetUtcNow()});}
            }
        }
        doc.Status="Confirmed";doc.ConfirmedAt=clock.GetUtcNow();doc.ConfirmedByUserId=actor;Audit(doc,actor,"Confirmed",before,lines);await Save(ct);await tx.CommitAsync(ct);return new {receipt=doc,lines};
    }
    IQueryable<WarehouseRack> ActiveRacks(Guid tenant,Guid warehouse)=>db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.WarehouseId==warehouse&&r.IsActive&&db.Warehouses.Any(w=>w.TenantId==tenant&&w.Id==warehouse&&w.IsActive)&&(r.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse&&z.Id==r.ZoneId&&z.IsActive)));
    IQueryable<StorageLocation> ActiveLocations(Guid tenant,Guid warehouse)=>db.StorageLocations.Where(l=>l.TenantId==tenant&&l.WarehouseId==warehouse&&l.IsActive&&db.Warehouses.Any(w=>w.TenantId==tenant&&w.Id==warehouse&&w.IsActive)&&(l.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse&&z.Id==l.ZoneId&&z.IsActive))&&(l.RackId==null||db.WarehouseRacks.Any(r=>r.TenantId==tenant&&r.WarehouseId==warehouse&&r.Id==l.RackId&&r.IsActive&&(r.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==warehouse&&z.Id==r.ZoneId&&z.IsActive)))));
    async Task ValidatePlacement(InboundReceipt doc,List<InboundReceiptLine> lines,CancellationToken ct)
    {
        foreach(var l in lines) {
            if(l.InspectedQuantity==null||l.Placements.Length>100)throw Error("검수 수량과 위치를 확인해 주세요.");
            foreach(var p in l.Placements){Quantity(p.Quantity,false);IebleWms.Api.Products.ProductPackaging.ValidateEach(p.Quantity,l.Unit);if(p.Serials==null)throw Error("시리얼 배치를 확인해 주세요.");if(l.TrackingAllocations==null&&l.SerialManaged&&p.Serials.Length!=p.Quantity)throw Error("위치별 시리얼 개수와 배치 수량이 일치해야 합니다.");if(!l.SerialManaged&&p.Serials.Length>0)throw Error("시리얼 미관리 상품입니다.");}
            var difference=l.Placements.Sum(x=>x.Quantity)-l.InspectedQuantity.Value;
            if(difference!=0)throw Error($"{l.ProductName}: 검수 수량보다 배치 수량이 {Math.Abs(difference):0.###} {l.Unit} {(difference>0?"초과되었습니다.":"부족합니다.")}");
            if(l.TrackingAllocations!=null)ValidateAllocatedPlacements(l);
            var assigned=l.Placements.SelectMany(x=>x.Serials).ToArray();if(l.SerialManaged&&(assigned.Distinct().Count()!=assigned.Length||!assigned.Order().SequenceEqual(l.Serials.Order())))throw Error("모든 검수 시리얼을 위치에 한 번씩 배치해 주세요.");
        }
        var ids=lines.SelectMany(x=>x.Placements).Select(x=>x.LocationId).Distinct().ToArray();
        var locations=await ActiveLocations(doc.TenantId,doc.WarehouseId).Where(x=>ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.Code,ct);
        if(locations.Count!=ids.Length)throw Error("선택한 창고의 사용 가능한 보관 위치를 지정해 주세요.");
        foreach(var line in lines){var placements=line.Placements;foreach(var placement in placements)placement.LocationCode=locations[placement.LocationId];line.Placements=placements;}
        if(!await db.Warehouses.AnyAsync(x=>x.TenantId==doc.TenantId&&x.Id==doc.WarehouseId&&x.IsActive,ct))throw Error("사용 중지된 창고입니다.");
    }
    static void Tracking(InboundReceiptLine l,decimal quantity,string? lot,DateOnly? expiry,string[] serials)
    {
        IebleWms.Api.Products.ProductPackaging.ValidateEach(quantity,l.Unit);
        if(serials==null||serials.Length>1000)throw Error("시리얼은 상품 행당 최대 1,000개입니다.");
        lot=string.IsNullOrWhiteSpace(lot)?null:lot.Trim();
        if(lot?.Length>100||lot?.Any(char.IsControl)==true||expiry==default(DateOnly))throw Error("상품의 LOT·유통기한 필수 정보를 확인해 주세요.");
        var normalized=serials.Select(s=>s?.Trim()??"").ToArray();
        if(normalized.Any(s=>s.Length is <1 or >100||s.Any(char.IsControl))||normalized.Distinct().Count()!=normalized.Length)throw Error("시리얼 번호의 형식 또는 중복을 확인해 주세요.");
        if(normalized.Length>0&&(decimal.Truncate(quantity)!=quantity||quantity!=normalized.Length))throw Error("시리얼 관리 상품은 정수 수량과 시리얼 개수가 일치해야 합니다.");
        l.LotManaged=lot!=null;l.ExpiryManaged=expiry.HasValue;l.SerialManaged=normalized.Length>0;
        l.LotNumber=lot;l.ExpiryDate=expiry;l.Serials=normalized;
    }
    static void UniqueSerials(List<InboundReceiptLine> lines){var all=lines.SelectMany(l=>l.Serials.Select(s=>(l.ProductId,s))).ToArray();if(all.Length>10000||all.Distinct().Count()!=all.Length)throw Error("동일 상품의 시리얼이 중복되었거나 문서당 10,000개를 초과했습니다.");}
    static void Quantity(decimal quantity,bool zero){if(quantity<(zero?0:0.001m)||quantity>999999999.999m||decimal.Round(quantity,3)!=quantity)throw Error("수량은 소수점 3자리 이내의 유효한 양수로 입력해 주세요. 검수 수량은 0을 허용합니다.");}
    static void Match(List<InboundReceiptLine> lines,IEnumerable<Guid> ids){var a=ids.ToArray();if(a.Length!=lines.Count||a.Distinct().Count()!=a.Length||a.Except(lines.Select(x=>x.Id)).Any())throw Error("입고 상품 행을 모두 확인해 주세요.");}
    async Task<InboundReceipt> Find(Guid tenant,Guid id,CancellationToken ct)=>await db.InboundReceipts.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error("입고 문서를 찾을 수 없습니다.",404);
    async Task<List<InboundReceiptLine>> Lines(Guid tenant,Guid id,CancellationToken ct)
    {
        var lines=await db.InboundReceiptLines.Where(x=>x.TenantId==tenant&&x.ReceiptId==id).OrderBy(x=>x.Position).ToListAsync(ct);
        var ids=lines.Select(x=>x.ProductId).Distinct().ToArray();
        var products=await db.Products.AsNoTracking().Where(x=>x.TenantId==tenant&&ids.Contains(x.Id)).Select(x=>new{x.Id,x.RetailPrice,x.Currency}).ToDictionaryAsync(x=>x.Id,ct);
        var rackIds=lines.Select(x=>x.PlannedRackId).ToArray();
        var racks=await db.WarehouseRacks.IgnoreQueryFilters().AsNoTracking().Where(x=>x.TenantId==tenant&&rackIds.Contains(x.Id)).ToListAsync(ct);
        foreach(var line in lines){if(products.TryGetValue(line.ProductId,out var product)){line.RetailPrice=product.RetailPrice;line.Currency=product.Currency;}var rack=racks.FirstOrDefault(x=>x.Id==line.PlannedRackId&&x.WarehouseId==line.PlannedRackWarehouseId);line.PlannedRackName=rack?.Name;line.PlannedRackCode=rack?.Code;}
        return lines;
    }
    static void Version(InboundReceipt doc,Guid version){if(version==Guid.Empty||doc.Version!=version)throw Error("다른 사용자가 입고 문서를 변경했습니다. 상세를 다시 열어 주세요.",409);}
    static void State(InboundReceipt doc,params string[] allowed){if(!allowed.Contains(doc.Status))throw Error("현재 입고 상태에서는 처리할 수 없습니다.",409);}
    Task<IDbContextTransaction> Begin(Guid tenant,CancellationToken ct)=>IebleWms.Api.Inventory.InventoryTransactions.Begin(db,tenant,ct);
    async Task Save(CancellationToken ct){try{await db.SaveChangesAsync(ct);}catch(DbUpdateConcurrencyException){throw Error("입고 문서가 변경되었습니다. 다시 조회해 주세요.",409);}catch(DbUpdateException){throw Error("입고번호·시리얼 중복 또는 참조 정보 변경으로 저장하지 못했습니다.",409);}}
    static JsonElement Snapshot(InboundReceipt doc,List<InboundReceiptLine> lines)=>JsonSerializer.SerializeToElement(new{receipt=doc,lines});
    ReceiptChange Audit(InboundReceipt doc,Guid actor,string action,object before,List<InboundReceiptLine> lines)=>AddChange(doc,actor,action,before,Snapshot(doc,lines));
    ReceiptChange AddChange(InboundReceipt doc,Guid actor,string action,object before,object after)
    {
        // Child-only placement edits must also advance the aggregate concurrency token.
        if(db.Entry(doc).State!=EntityState.Added)db.Entry(doc).Property(x=>x.UpdatedAt).IsModified=true;
        var change=new ReceiptChange{TenantId=doc.TenantId,ReceiptId=doc.Id,ActorId=actor,Action=action,CreatedAt=clock.GetUtcNow(),BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(after)};db.ReceiptChanges.Add(change);return change;
    }
    static OrganizationException Error(string message,int status=400)=>new(status,message);
}
