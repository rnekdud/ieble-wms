using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Inventory;

public sealed partial class StocktakeService(WmsDbContext db, InventoryService inventory, ProductUsagePolicy products, TimeProvider clock)
{
    static OrganizationException Error(string message,int status=400)=>new(status,message);
    static string Json(object value)=>JsonSerializer.Serialize(value);
    static string? Text(string? value,int max=100) {var s=value?.Trim();if(string.IsNullOrEmpty(s))return null;if(s.Length>max||s.Any(char.IsControl))throw Error("입력 길이와 형식을 확인해 주세요.");return s;}
    static void Quantity(decimal? q){if(q is <0 or >999999999.999m||(q.HasValue&&decimal.Round(q.Value,3)!=q))throw Error("수량은 0 이상, 소수점 3자리까지 입력해 주세요.");}
    static int Page(int page,int total)=>Math.Min(Math.Max(1,page),Math.Max(1,(int)Math.Ceiling(total/20d)));
    async Task<Stocktake> Document(Guid tenant,Guid id,CancellationToken ct)=>await db.Stocktakes.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error("실사 문서를 찾을 수 없습니다.",404);
    IQueryable<StocktakeTarget> Targets(Stocktake d)=>db.StocktakeTargets.Where(x=>x.TenantId==d.TenantId&&x.StocktakeId==d.Id);
    IQueryable<StorageLocation> Locations(Stocktake d)
    {
        var q=db.StorageLocations.Where(x=>x.TenantId==d.TenantId&&x.WarehouseId==d.WarehouseId);
        return d.Scope switch {
            "Warehouse" or "Selected"=>q,"Location"=>q.Where(x=>x.Id==d.ScopeId),"Rack"=>q.Where(x=>x.RackId==d.ScopeId),
            "Zone"=>q.Where(x=>x.ZoneId==d.ScopeId||db.WarehouseRacks.Any(r=>r.TenantId==d.TenantId&&r.WarehouseId==d.WarehouseId&&r.Id==x.RackId&&r.ZoneId==d.ScopeId)),_=>throw Error("실사 범위를 확인해 주세요.")};
    }
    IQueryable<StockBalance> Stocks(Stocktake d)=>db.StockBalances.Where(x=>x.TenantId==d.TenantId&&x.WarehouseId==d.WarehouseId&&Locations(d).Any(l=>l.Id==x.LocationId));
    static bool Changed(StocktakeTarget t,StockBalance? s)=>s==null||t.BaselineVersion!=s.Version||t.LocationId!=s.LocationId||t.WarehouseId!=s.WarehouseId||t.BaselineQuantity!=s.Quantity||t.BaselineReserved!=s.ReservedQuantity;
    static bool SameKey(StocktakeTarget t,StockBalance s)=>t.ProductId==s.ProductId&&(t.SerialNumber!=null?t.SerialNumber==s.SerialNumber:t.LocationId==s.LocationId&&t.LotNumber==s.LotNumber&&t.ExpiryDate==s.ExpiryDate&&s.SerialNumber==null);
    void Check(Stocktake d,Guid version,params string[] states){if(d.Version!=version)throw Error("실사 문서가 변경되었습니다. 다시 조회한 후 처리해 주세요.",409);if(!states.Contains(d.Status))throw Error("현재 실사 단계에서는 처리할 수 없습니다.",409);}
    async Task Log(Stocktake d,Guid actor,string action,object before,object after,CancellationToken ct,Guid? target=null)
    {db.StocktakeChanges.Add(new(){TenantId=d.TenantId,StocktakeId=d.Id,TargetId=target,ActorId=actor,ActorName=await db.Users.Where(x=>x.Id==actor).Select(x=>x.DisplayName).SingleOrDefaultAsync(ct)??"",Action=action,BeforeJson=before is string s?s:Json(before),AfterJson=Json(after),CreatedAt=clock.GetUtcNow()});if(db.Entry(d).State!=EntityState.Added)db.Entry(d).Property(x=>x.UpdatedAt).IsModified=true;}
    async Task Save(CancellationToken ct){try{await db.SaveChangesAsync(ct);}catch(DbUpdateException){throw Error("동시 변경 또는 참조 데이터 충돌로 저장하지 못했습니다. 기존 재고는 유지됩니다. 다시 조회해 주세요.",409);}}
    async Task<StocktakeTarget> Capture(Stocktake d,StockBalance s,CancellationToken ct)
    {
        var p=await db.Products.SingleAsync(x=>x.TenantId==d.TenantId&&x.Id==s.ProductId,ct);var l=await db.StorageLocations.SingleAsync(x=>x.TenantId==d.TenantId&&x.WarehouseId==s.WarehouseId&&x.Id==s.LocationId,ct);
        return new(){TenantId=d.TenantId,StocktakeId=d.Id,StockId=s.Id,ProductId=p.Id,WarehouseId=s.WarehouseId,LocationId=s.LocationId,ProductCode=p.Code,ProductName=p.Name,Unit=s.Unit,LocationCode=l.Code,RackCode=await db.WarehouseRacks.Where(x=>x.TenantId==d.TenantId&&x.WarehouseId==s.WarehouseId&&x.Id==l.RackId).Select(x=>x.Code).SingleOrDefaultAsync(ct)??"",LotNumber=s.LotNumber,ExpiryDate=s.ExpiryDate,SerialNumber=s.SerialNumber,OriginalQuantity=s.Quantity,OriginalReserved=s.ReservedQuantity,OriginalSnapshotAt=clock.GetUtcNow(),BaselineQuantity=s.Quantity,BaselineReserved=s.ReservedQuantity,BaselineVersion=s.Version,BaselineAt=clock.GetUtcNow()};
    }
    public async Task<object> List(Guid tenant,string? search,string? status,Guid? warehouseId,DateOnly? from,DateOnly? to,int page,CancellationToken ct)
    {
        if(search?.Length>100||page<1||page>100000||from>to)throw Error("검색 조건을 확인해 주세요.");
        var q=db.Stocktakes.AsNoTracking().Where(x=>x.TenantId==tenant);if(!string.IsNullOrWhiteSpace(search)){var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Name.ToLower().Contains(term)||x.Number.ToLower().Contains(term));}
        if(!string.IsNullOrEmpty(status)&&status!="all")q=q.Where(x=>x.Status==status);if(warehouseId.HasValue)q=q.Where(x=>x.WarehouseId==warehouseId);if(from.HasValue)q=q.Where(x=>x.BasisDate>=from);if(to.HasValue)q=q.Where(x=>x.BasisDate<=to);
        var total=await q.CountAsync(ct);page=Page(page,total);
        return new{items=await q.OrderByDescending(x=>x.Number).Skip((page-1)*20).Take(20).Select(d=>new{document=d,productCount=db.StocktakeTargets.Where(t=>t.TenantId==tenant&&t.StocktakeId==d.Id&&!t.Excluded).Select(t=>t.ProductId).Distinct().Count(),targetCount=db.StocktakeTargets.Count(t=>t.TenantId==tenant&&t.StocktakeId==d.Id&&!t.Excluded),differenceCount=db.StocktakeTargets.Count(t=>t.TenantId==tenant&&t.StocktakeId==d.Id&&!t.Excluded&&t.CountedQuantity!=null&&t.CountedQuantity!=t.BaselineQuantity)}).ToListAsync(ct),total,page,pageSize=20};
    }
    async Task<(List<StockBalance> stocks,List<StocktakeTarget> targets,List<Guid> conflicts,bool incoming)> Conflict(Stocktake d,CancellationToken ct)
    {
        var stockQuery=Stocks(d);
        var targetQuery=Targets(d);
        if(d.Scope=="Selected")stockQuery=stockQuery.Where(s=>targetQuery.Any(t=>!t.Excluded&&(t.StockId==s.Id||(t.IsUnregistered&&t.ProductId==s.ProductId&&t.LocationId==s.LocationId&&t.LotNumber==s.LotNumber&&t.ExpiryDate==s.ExpiryDate&&t.SerialNumber==s.SerialNumber))));
        var stocks=await stockQuery.ToListAsync(ct);var targets=await Targets(d).ToListAsync(ct);
        var allSerial=targets.Any(x=>x.IsUnregistered&&x.SerialNumber!=null)?await db.StockBalances.Where(x=>x.TenantId==d.TenantId&&x.SerialNumber!=null).ToListAsync(ct):[];
        var conflicts=targets.Where(x=>!x.Excluded&&(x.IsUnregistered?stocks.Concat(allSerial).Any(s=>SameKey(x,s)):Changed(x,stocks.Find(s=>s.Id==x.StockId)))).Select(x=>x.Id).ToList();
        var incoming=d.Scope!="Selected"&&stocks.Any(s=>!targets.Any(t=>!t.Excluded&&t.StockId==s.Id));return(stocks,targets,conflicts,incoming);
    }
    public async Task<object> Detail(Guid tenant,Guid id,CancellationToken ct)
    {
        var d=await Document(tenant,id,ct);var q=Targets(d).Where(x=>!x.Excluded);var total=await q.CountAsync(ct);var counted=await q.CountAsync(x=>x.CountedQuantity!=null,ct);var differences=await q.CountAsync(x=>x.CountedQuantity!=null&&x.CountedQuantity!=x.BaselineQuantity,ct);
        var conflicts=new List<Guid>();var incoming=false;if(d.Status is not ("Confirmed" or "Cancelled")){var c=await Conflict(d,ct);conflicts=c.conflicts;incoming=c.incoming;}
        var shortages=await q.CountAsync(x=>x.CountedQuantity<x.BaselineQuantity,ct);var excesses=await q.CountAsync(x=>x.CountedQuantity>x.BaselineQuantity,ct);
        var selectedItems=d.Scope=="Selected"?(await q.ToListAsync(ct)).OrderBy(t=>t.OriginalSnapshotAt).ThenBy(t=>t.Id).ToList():null;
        var confirmedByName=d.ConfirmedBy.HasValue?await db.Users.Where(u=>u.Id==d.ConfirmedBy).Select(u=>u.DisplayName).SingleOrDefaultAsync(ct):null;
        return new{document=d,summary=new{total,counted,missing=total-counted,differences,shortages,excesses,matches=counted-differences},conflicts,incoming,selectedItems,confirmedByName};
    }
    public async Task<object> Items(Guid tenant,Guid id,string? search,string state,int page,CancellationToken ct)
    {
        var d=await Document(tenant,id,ct);var q=Targets(d).AsNoTracking();if(state!="excluded")q=q.Where(x=>!x.Excluded);
        if(!string.IsNullOrWhiteSpace(search)){var term=Text(search)!.ToLowerInvariant();q=q.Where(x=>x.ProductCode.ToLower().Contains(term)||x.ProductName.ToLower().Contains(term)||x.LocationCode.ToLower().Contains(term)||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term)));}
        q=state switch{"all"=>q,"missing"=>q.Where(x=>x.CountedQuantity==null),"match"=>q.Where(x=>x.CountedQuantity==x.BaselineQuantity),"short"=>q.Where(x=>x.CountedQuantity<x.BaselineQuantity),"over"=>q.Where(x=>x.CountedQuantity>x.BaselineQuantity),"difference"=>q.Where(x=>x.CountedQuantity!=null&&x.CountedQuantity!=x.BaselineQuantity),"excluded"=>q.Where(x=>x.Excluded),_=>throw Error("실사 항목 상태를 확인해 주세요.")};
        var total=await q.CountAsync(ct);page=Page(page,total);return new{items=await q.OrderBy(x=>x.LocationCode).ThenBy(x=>x.ProductCode).ThenBy(x=>x.Id).Skip((page-1)*20).Take(20).ToListAsync(ct),total,page,pageSize=20};
    }
    public async Task<object> History(Guid tenant,Guid id,int page,CancellationToken ct){await Document(tenant,id,ct);var q=db.StocktakeChanges.AsNoTracking().Where(x=>x.TenantId==tenant&&x.StocktakeId==id);var total=await q.CountAsync(ct);page=Page(page,total);return new{items=await q.OrderByDescending(x=>x.Id).Skip((page-1)*20).Take(20).ToListAsync(ct),total,page,pageSize=20};}
    public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,Guid? rackId,int page,CancellationToken ct,ProductSelectionQuery? selection=null)
    {
        if(kind=="floor-locations"){var floors=inventory.ActiveLocations(tenant).Where(l=>l.WarehouseId==warehouseId&&l.RackId==null);var floorTerm=Text(search)??"";if(floorTerm!="")floors=floors.Where(l=>l.Code.Contains(floorTerm)||l.Name.Contains(floorTerm));return new{items=await floors.OrderBy(l=>l.Code).Skip((Math.Max(1,page)-1)*30).Take(30).Select(l=>new{l.Id,l.Code,l.Name}).ToListAsync(ct),total=await floors.CountAsync(ct),page,pageSize=30};}
        if(kind=="product-options")return await DocumentProductSelection.Options(db,tenant,ct);
        if(kind=="product-table")return await DocumentProductSelection.List(db,tenant,search,page,selection??new(),null,null,ct);
        if(kind!="zones")return await inventory.Choices(tenant,kind,search,warehouseId,rackId,page,ct);
        var term=Text(search)??"";var q=db.WarehouseZones.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&(x.Code.Contains(term)||x.Name.Contains(term)));return new{items=await q.OrderBy(x=>x.Code).Skip((Math.Max(1,page)-1)*30).Take(30).Select(x=>new{x.Id,x.Code,x.Name}).ToListAsync(ct),total=await q.CountAsync(ct),page};
    }
    public async Task<object> Create(Guid tenant,Guid actor,StocktakeRequest r,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Json(r))));
        if(r.RequestId==Guid.Empty)throw Error("등록 요청 번호를 확인해 주세요.");var existing=await db.Stocktakes.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);if(existing!=null){if(existing.RequestHash!=hash)throw Error("같은 등록 요청의 내용이 다릅니다.",409);return await Detail(tenant,existing.Id,ct);}
        var name=Text(r.Name,200)??throw Error("실사명을 입력해 주세요.");if(r.BasisAt==default||r.BasisAt>clock.GetUtcNow().AddMinutes(5))throw Error("기준일시는 현재 이전으로 입력해 주세요. 과거 재고를 복원하지 않으며 실제 스냅샷은 등록 시점에 생성합니다.");
        var w=await db.Warehouses.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.WarehouseId&&x.IsActive,ct)??throw Error("활성 창고를 선택해 주세요.");
        var assignee = await BusinessAssignees.Resolve(db,tenant,actor,r.ContactUserId,true,null,null,ct);
        var d=new Stocktake{TenantId=tenant,Number=await IebleWms.Api.Services.BusinessCodes.Next(db,tenant,"ST",ct),Name=name,WarehouseId=w.Id,WarehouseName=w.Name,Scope=r.Scope,ScopeId=r.ScopeId,BasisAt=r.BasisAt.ToUniversalTime(),BasisDate=DateOnly.FromDateTime(r.BasisAt.ToOffset(TimeSpan.FromHours(9)).Date),SnapshotAt=clock.GetUtcNow(),ContactUserId=assignee.Id,ContactName=assignee.Name,Notes=Text(r.Notes,2000),RequestId=r.RequestId,RequestHash=hash};
        d.ScopeLabel=r.Scope switch{
            "Warehouse" when r.ScopeId==null=>"창고 전체",
            "Selected" when r.ScopeId==null=>"차이 상품만 등록",
            "Zone"=>await db.WarehouseZones.Where(x=>x.TenantId==tenant&&x.WarehouseId==w.Id&&x.Id==r.ScopeId).Select(x=>x.Name).SingleOrDefaultAsync(ct)??throw Error("구역을 확인해 주세요."),
            "Rack"=>await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==w.Id&&x.Id==r.ScopeId).Select(x=>x.Code).SingleOrDefaultAsync(ct)??throw Error("랙을 확인해 주세요."),
            "Location"=>await db.StorageLocations.Where(x=>x.TenantId==tenant&&x.WarehouseId==w.Id&&x.Id==r.ScopeId).Select(x=>x.Code).SingleOrDefaultAsync(ct)??throw Error("위치를 확인해 주세요."),_=>throw Error("실사 범위를 확인해 주세요.")};
        if(d.Scope=="Selected")
        {
            if(r.Selection is not {Length: >0 and <=100})throw Error("선택한 실사 상품은 1~100행으로 등록해 주세요.");
            d.Status="Counting";d.StartedAt=clock.GetUtcNow();db.Stocktakes.Add(d);
            await AddSelected(d,actor,r.Selection,ct);await Log(d,actor,"Created",new{},d,ct);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,d.Id,ct);
        }
        if(r.Selection is {Length: >0})throw Error("전체 실사에는 선택 대상을 지정할 수 없습니다.");
        if(await Stocks(d).CountAsync(ct)>10000)throw Error("한 번에 10,000개 재고 행까지 실사할 수 있습니다. 범위를 좁혀 주세요.");
        db.Stocktakes.Add(d);foreach(var s in await Stocks(d).ToListAsync(ct)){var target=await Capture(d,s,ct);db.StocktakeTargets.Add(target);await Log(d,actor,"Snapshot",new{},target,ct,target.Id);}
        await Log(d,actor,"Created",new{},d,ct);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,d.Id,ct);
    }
    public async Task<object> Counts(Guid tenant,Guid actor,Guid id,StocktakeCountRequest r,bool reasonsOnly,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);var d=await Document(tenant,id,ct);Check(d,r.Version,reasonsOnly?["Reviewing"]:["Counting","Reviewing"]);
        if(r.Items.Length is <1 or >100||r.Items.Select(x=>x.TargetId).Distinct().Count()!=r.Items.Length)throw Error("저장할 실사 항목을 확인해 주세요.");
        foreach(var input in r.Items){var t=await Targets(d).SingleOrDefaultAsync(x=>x.Id==input.TargetId&&!x.Excluded,ct)??throw Error("실사 항목을 찾을 수 없습니다.",404);var before=Json(t);var reason=Text(input.Reason,500);
            if(!reasonsOnly){Quantity(input.Quantity);if(input.Quantity.HasValue)IebleWms.Api.Products.ProductPackaging.ValidateEach(input.Quantity.Value,t.Unit);var serial=Text(input.ObservedSerial);if(t.SerialNumber!=null&&((input.Quantity.HasValue&&input.Quantity!=0&&input.Quantity!=1)||(input.Quantity==1&&serial!=t.SerialNumber)||(input.Quantity!=1&&serial!=null)))throw Error("시리얼은 실제 확인한 식별값을 입력해 주세요. 수량은 0 또는 1이며, 0/미입력에는 확인 시리얼을 비워 주세요.");if(t.SerialNumber==null&&serial!=null)throw Error("이 재고는 시리얼 입력 대상이 아닙니다.");t.CountedQuantity=input.Quantity;t.ObservedSerial=serial;t.CountedBy=actor;t.CountedAt=clock.GetUtcNow();}
            t.Reason=reason;await Log(d,actor,reasonsOnly?"Reason":"Count",before,t,ct,t.Id);
        }
        await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    public async Task<object> Found(Guid tenant,Guid actor,Guid id,StocktakeFoundRequest r,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);var d=await Document(tenant,id,ct);Check(d,r.Version,"Counting");if(r.RequestId==Guid.Empty)throw Error("항목 요청 번호를 확인해 주세요.");
        Quantity(r.Quantity);if(r.Quantity<=0)throw Error("발견한 수량을 입력해 주세요.");var product=await products.LockForInventory(tenant,r.ProductId,ct);IebleWms.Api.Products.ProductPackaging.ValidateEach(r.Quantity,product.Unit);
        var location=await inventory.ActiveLocations(tenant).SingleOrDefaultAsync(x=>x.WarehouseId==d.WarehouseId&&x.Id==r.LocationId,ct);if(location==null||!await Locations(d).AnyAsync(x=>x.Id==r.LocationId,ct))throw Error("실사 범위 안의 활성 위치를 선택해 주세요.");
        var lot=Text(r.LotNumber);var serial=Text(r.SerialNumber);if(r.ExpiryDate==default(DateOnly)||(serial!=null&&r.Quantity!=1))throw Error("상품의 LOT·유통기한·시리얼 설정을 확인해 주세요.");
        var t=new StocktakeTarget{Id=r.RequestId,TenantId=tenant,StocktakeId=id,ProductId=product.Id,ProductCode=product.Code,ProductName=product.Name,Unit=product.Unit,WarehouseId=d.WarehouseId,LocationId=location.Id,LocationCode=location.Code,RackCode=await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==d.WarehouseId&&x.Id==location.RackId).Select(x=>x.Code).SingleOrDefaultAsync(ct)??"",LotNumber=lot,ExpiryDate=r.ExpiryDate,SerialNumber=serial,IsUnregistered=true,OriginalSnapshotAt=clock.GetUtcNow(),BaselineAt=clock.GetUtcNow(),CountedQuantity=r.Quantity,ObservedSerial=serial,CountedBy=actor,CountedAt=clock.GetUtcNow(),Reason=Text(r.Reason,500)};
        var stocks=await db.StockBalances.Where(x=>x.TenantId==tenant&&x.ProductId==product.Id).ToListAsync(ct);var targets=await Targets(d).Where(x=>!x.Excluded&&x.ProductId==product.Id).ToListAsync(ct);
        if(stocks.Any(s=>SameKey(t,s))||targets.Any(x=>serial!=null?x.SerialNumber==serial:x.LocationId==t.LocationId&&x.LotNumber==lot&&x.ExpiryDate==t.ExpiryDate&&x.SerialNumber==null))throw Error("동일 재고 또는 시리얼이 있습니다. 기존 실사 항목을 사용하거나 재고 변경 재확인을 진행해 주세요.",409);
        db.StocktakeTargets.Add(t);await Log(d,actor,"Found",new{},t,ct,t.Id);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    public async Task<object> Action(Guid tenant,Guid actor,Guid id,string action,StocktakeAction r,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);var d=await Document(tenant,id,ct);if(action is "confirm" or "confirm-selected"&&d.Status=="Confirmed")return await Detail(tenant,id,ct);
        Check(d,r.Version,"Prepared","Counting","Counted","Reviewing");var before=Json(d);
        switch(action){
            case "start":Check(d,r.Version,"Prepared");await NoConflict(d,ct);d.Status="Counting";d.StartedAt=clock.GetUtcNow();break;
            case "complete":Check(d,r.Version,"Counting");await AllCounted(d,ct);d.Status="Counted";break;
            case "review":Check(d,r.Version,"Counted");d.Status="Reviewing";break;
            case "reopen":Check(d,r.Version,"Counted","Reviewing");d.Status="Counting";break;
            case "reconfirm":await Reconfirm(d,actor,ct);break;
            case "cancel":d.Status="Cancelled";break;
            case "confirm-selected":if(d.Scope!="Selected")throw Error("차이 상품 실사만 바로 확정할 수 있습니다.");Check(d,r.Version,"Counting","Counted","Reviewing");await Finalize(d,actor,ct);break;
            case "confirm":Check(d,r.Version,"Reviewing");await Finalize(d,actor,ct);break;
            default:throw Error("실사 작업을 확인해 주세요.");
        }
        await Log(d,actor,action,before,d,ct);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    async Task AllCounted(Stocktake d,CancellationToken ct){if(await Targets(d).AnyAsync(x=>!x.Excluded&&x.CountedQuantity==null,ct))throw Error("미실사 항목이 있습니다. 실제 0개인 경우에도 0을 입력해 주세요.",409);}
    async Task NoConflict(Stocktake d,CancellationToken ct){var c=await Conflict(d,ct);if(c.conflicts.Count>0||c.incoming)throw Error("기준 이후 재고·예약·위치 또는 대상 범위가 변경되었습니다. ‘재고 변경 재확인’ 후 해당 항목을 다시 실사해 주세요.",409);}
    async Task Reconfirm(Stocktake d,Guid actor,CancellationToken ct)
    {
        var c=await Conflict(d,ct);if(c.stocks.Count>10000)throw Error("대상 재고가 10,000개를 초과했습니다. 범위를 좁힌 새 실사를 등록해 주세요.");
        foreach(var t in c.targets){if(d.Scope=="Selected"&&t.Excluded)continue;var s=c.stocks.Find(s=>s.Id==t.StockId);if(t.IsUnregistered){if(c.conflicts.Contains(t.Id)){var old=Json(t);t.Excluded=true;await Log(d,actor,"ExcludedCollision",old,t,ct,t.Id);}continue;}
            if(!Changed(t,s)&&!t.Excluded)continue;var before=Json(t);t.Excluded=s==null;
            if(s!=null){t.BaselineQuantity=s.Quantity;t.BaselineReserved=s.ReservedQuantity;t.BaselineVersion=s.Version;t.BaselineAt=clock.GetUtcNow();t.LocationId=s.LocationId;var captured=await Capture(d,s,ct);t.LocationCode=captured.LocationCode;t.RackCode=captured.RackCode;}
            t.CountedQuantity=null;t.ObservedSerial=null;t.Reason=null;t.CountedBy=null;t.CountedAt=null;await Log(d,actor,"Rebased",before,t,ct,t.Id);
        }
        foreach(var s in c.stocks.Where(s=>d.Scope!="Selected"&&!c.targets.Any(t=>t.StockId==s.Id))){var t=await Capture(d,s,ct);db.StocktakeTargets.Add(t);await Log(d,actor,"AddedSnapshot",new{},t,ct,t.Id);}
        if(d.Status!="Prepared")d.Status="Counting";
    }
    async Task Finalize(Stocktake d,Guid actor,CancellationToken ct)
    {
        if(d.Scope=="Selected")foreach(var productId in await Targets(d).Where(t=>!t.Excluded).Select(t=>t.ProductId).Distinct().OrderBy(id=>id).ToListAsync(ct))await products.LockForInventory(d.TenantId,productId,ct);
        await AllCounted(d,ct);await NoConflict(d,ct);var targets=await Targets(d).Where(x=>!x.Excluded).OrderBy(x=>x.Id).ToListAsync(ct);
        // Validate the entire document before mutating any stock. Product locks share the existing lock order.
        if(d.Scope=="Selected"&&targets.Count==0)throw Error("실사 대상을 하나 이상 선택해 주세요.");
        foreach(var t in targets){if(d.Scope=="Selected"&&!await inventory.ActiveLocations(d.TenantId).AnyAsync(l=>l.Id==t.LocationId&&l.WarehouseId==t.WarehouseId,ct))throw Error("선택한 보관 위치가 비활성화되었습니다. 위치를 확인해 주세요.",409);var q=t.CountedQuantity!.Value;Quantity(q);IebleWms.Api.Products.ProductPackaging.ValidateEach(q,t.Unit);if(q!=t.BaselineQuantity&&string.IsNullOrWhiteSpace(t.Reason))throw Error("차이 발생 항목의 사유를 입력해 주세요.");if(q<t.BaselineReserved)throw Error("실사 수량이 출고 예약보다 적습니다. 예약을 보호하기 위해 확정을 차단합니다.",409);
            if(t.SerialNumber!=null&&(q is not (0 or 1)||(q==1&&t.ObservedSerial!=t.SerialNumber)))throw Error("실제 확인한 시리얼 정보를 확인해 주세요.");
            if(t.IsUnregistered){var p=await products.LockForInventory(d.TenantId,t.ProductId,ct);if(p.Unit!=t.Unit)throw Error("상품 추적 정책이 변경되었습니다. 재확인해 주세요.",409);if(!await inventory.ActiveLocations(d.TenantId).AnyAsync(x=>x.WarehouseId==t.WarehouseId&&x.Id==t.LocationId,ct))throw Error("미등록 재고의 위치가 비활성화되었습니다.",409);}
        }
        foreach(var t in targets){if(d.Scope=="Selected"&&t.CountedQuantity==t.BaselineQuantity)continue;StockBalance s;if(t.IsUnregistered){s=new(){TenantId=d.TenantId,ProductId=t.ProductId,WarehouseId=t.WarehouseId,LocationId=t.LocationId,Unit=t.Unit,LotNumber=t.LotNumber,ExpiryDate=t.ExpiryDate,SerialNumber=t.SerialNumber,SourceKey=$"COUNT:{t.Id:N}"};db.StockBalances.Add(s);t.StockId=s.Id;}else s=await db.StockBalances.SingleAsync(x=>x.TenantId==d.TenantId&&x.Id==t.StockId,ct);
            var delta=t.CountedQuantity!.Value-t.BaselineQuantity;s.Quantity+=delta;if(s.Quantity<s.ReservedQuantity)throw Error("예약 수량을 보호하기 위해 확정을 차단합니다.",409);
            // Even a matching count invalidates another document's older baseline.
            if(db.Entry(s).State!=EntityState.Added)db.Entry(s).Property(x=>x.UpdatedAt).IsModified=true;
            if(delta!=0)db.StockMovements.Add(new(){TenantId=d.TenantId,StockId=s.Id,StocktakeId=d.Id,Type=delta>0?"StocktakeIncrease":"StocktakeDecrease",Quantity=delta,ActorId=actor,CreatedAt=clock.GetUtcNow()});
            await Log(d,actor,"Applied",new{stockId=s.Id,quantity=t.BaselineQuantity,reserved=t.BaselineReserved},new{stockId=s.Id,quantity=s.Quantity,reserved=s.ReservedQuantity,delta,t.Reason},ct,t.Id);
        }
        d.Status="Confirmed";d.ConfirmedAt=clock.GetUtcNow();d.ConfirmedBy=actor;
    }
}
