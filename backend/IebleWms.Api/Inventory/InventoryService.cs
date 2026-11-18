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

public sealed partial class InventoryService(WmsDbContext db, ProductUsagePolicy products, TimeProvider clock)
{
    internal IQueryable<StorageLocation> ActiveLocations(Guid tenant)=>db.StorageLocations.Where(l=>l.TenantId==tenant&&l.IsActive&&db.Warehouses.Any(w=>w.TenantId==tenant&&w.Id==l.WarehouseId&&w.IsActive)&&(l.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==l.WarehouseId&&z.Id==l.ZoneId&&z.IsActive))&&(l.RackId==null||db.WarehouseRacks.Any(r=>r.TenantId==tenant&&r.WarehouseId==l.WarehouseId&&r.Id==l.RackId&&r.IsActive&&(r.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==l.WarehouseId&&z.Id==r.ZoneId&&z.IsActive)))));
    IQueryable<InventoryRow> Rows(Guid tenant)
    {
        var active = ActiveLocations(tenant);
        return from s in db.StockBalances.AsNoTracking() where s.TenantId==tenant
        join p in db.Products on new{s.TenantId,Id=s.ProductId} equals new{p.TenantId,p.Id}
        join w in db.Warehouses on new{s.TenantId,Id=s.WarehouseId} equals new{w.TenantId,w.Id}
        join l in db.StorageLocations on new{s.TenantId,s.WarehouseId,Id=s.LocationId} equals new{l.TenantId,l.WarehouseId,l.Id}
        select new InventoryRow{Id=s.Id,Version=s.Version,ProductId=p.Id,ProductCode=p.Code,ProductName=p.Name,Barcode=p.Barcode,WarehouseId=w.Id,WarehouseName=w.Name,RackId=l.RackId,RackCode=db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.WarehouseId==w.Id&&r.Id==l.RackId).Select(r=>r.Code).FirstOrDefault(),LocationId=l.Id,LocationCode=l.Code,Unit=s.Unit,LotNumber=s.LotNumber,ExpiryDate=s.ExpiryDate,SerialNumber=s.SerialNumber,Quantity=s.Quantity,ReservedQuantity=s.ReservedQuantity,AvailableQuantity=s.Quantity-s.ReservedQuantity,SerialManaged=s.SerialNumber!=null,IsActive=p.IsActive&&active.Any(a=>a.Id==l.Id&&a.WarehouseId==l.WarehouseId)};
    }
    public async Task<object> List(Guid tenant,InventoryQuery r,CancellationToken ct)
    {
        Page(r.Page,r.PageSize);
        if(r.Search?.Length>100||r.Lot?.Length>100||r.Status is not ("all" or "available" or "reserved" or "zero" or "onhand")||r.Active is not ("all" or "active" or "inactive"))throw Error("검색 조건을 확인해 주세요.");
        var q=Rows(tenant);var search=r.Search?.Trim().ToLowerInvariant();
        if(!string.IsNullOrEmpty(search))q=q.Where(x=>x.ProductName.ToLower().Contains(search)||x.ProductCode.ToLower().Contains(search)||(x.LotNumber!=null&&x.LotNumber.ToLower().Contains(search))||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(search))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.ProductId&&b.Value.ToLower().Contains(search)));
        if(!string.IsNullOrWhiteSpace(r.Lot)){var lot=r.Lot.Trim().ToLowerInvariant();q=q.Where(x=>x.LotNumber!=null&&x.LotNumber.ToLower().Contains(lot));}
        if(r.ProductId.HasValue)q=q.Where(x=>x.ProductId==r.ProductId);if(r.WarehouseId.HasValue)q=q.Where(x=>x.WarehouseId==r.WarehouseId);if(r.RackId.HasValue)q=q.Where(x=>x.RackId==r.RackId);if(r.LocationId.HasValue)q=q.Where(x=>x.LocationId==r.LocationId);
        q=r.Status switch{"available"=>q.Where(x=>x.AvailableQuantity>0),"reserved"=>q.Where(x=>x.ReservedQuantity>0),"zero"=>q.Where(x=>x.Quantity==0),"onhand"=>q.Where(x=>x.Quantity>0),_=>q};
        if(r.Active!="all")q=q.Where(x=>x.IsActive==(r.Active=="active"));
        var total=await q.CountAsync(ct);var page=Math.Min(r.Page,Math.Max(1,(int)Math.Ceiling(total/(double)r.PageSize)));
        return new{items=await q.OrderBy(x=>x.ProductCode).ThenBy(x=>x.WarehouseName).ThenBy(x=>x.LocationCode).ThenBy(x=>x.Id).Skip((page-1)*r.PageSize).Take(r.PageSize).ToListAsync(ct),total,page,pageSize=r.PageSize};
    }
    public async Task<object> Detail(Guid tenant,Guid id,CancellationToken ct)
    {
        var stock=await Rows(tenant).SingleOrDefaultAsync(x=>x.Id==id,ct)??throw Error("재고를 찾을 수 없습니다.",404);
        var q=db.StockBalances.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ProductId==stock.ProductId);
        // Canonical unit is locked once inventory exists; still group explicitly for legacy data.
        object totals=db.Database.IsNpgsql()?await q.GroupBy(x=>x.Unit).Select(g=>new{unit=g.Key,quantity=g.Sum(x=>x.Quantity),reservedQuantity=g.Sum(x=>x.ReservedQuantity),availableQuantity=g.Sum(x=>x.Quantity-x.ReservedQuantity)}).ToListAsync(ct)
            :await q.GroupBy(x=>x.Unit).Select(g=>new{unit=g.Key,quantity=g.Sum(x=>(double)x.Quantity),reservedQuantity=g.Sum(x=>(double)x.ReservedQuantity),availableQuantity=g.Sum(x=>(double)(x.Quantity-x.ReservedQuantity))}).ToListAsync(ct);
        return new{stock,productTotals=totals};
    }
    public async Task<object> History(Guid tenant,string? search,string type,Guid? stockId,int page,int pageSize,CancellationToken ct)
    {
        Page(page,pageSize);if(search?.Length>100||type is not ("all" or "Move" or "Increase" or "Decrease"))throw Error("조회 조건을 확인해 주세요.");
        var q=db.InventoryOperations.AsNoTracking().Where(x=>x.TenantId==tenant);
        if(type!="all")q=q.Where(x=>x.Type==type);if(stockId.HasValue)q=q.Where(x=>x.SourceStockId==stockId||x.DestinationStockId==stockId);
        if(!string.IsNullOrWhiteSpace(search)){var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Number.ToLower().Contains(term)||x.ProductCode.ToLower().Contains(term)||x.ProductName.ToLower().Contains(term)||(x.LotNumber!=null&&x.LotNumber.ToLower().Contains(term))||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.ProductId&&b.Value.ToLower().Contains(term)));}
        var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/(double)pageSize)));
        // Number begins with a UTC timestamp, sortable on both supported test/production providers.
        return new{items=await q.OrderByDescending(x=>x.Number).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct),total,page,pageSize};
    }
    public async Task<object> Operation(Guid tenant,Guid id,CancellationToken ct)
    {
        var operation=await db.InventoryOperations.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error("이동·조정 내역을 찾을 수 없습니다.",404);
        return new{operation,movements=await db.StockMovements.AsNoTracking().Where(x=>x.TenantId==tenant&&x.OperationId==id).ToListAsync(ct)};
    }
    public async Task<object> Movements(Guid tenant,Guid stockId,int page,CancellationToken ct)
    {
        Page(page,20);if(!await db.StockBalances.AnyAsync(x=>x.TenantId==tenant&&x.Id==stockId,ct))throw Error("재고를 찾을 수 없습니다.",404);
        var q=db.StockMovements.AsNoTracking().Where(x=>x.TenantId==tenant&&x.StockId==stockId);var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/20d)));
        // EF SQLite cannot order DateTimeOffset; production uses real processing time order.
        var sorted=db.Database.IsNpgsql()?q.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id):q.OrderBy(x=>x.Id);
        return new{items=await sorted.Skip((page-1)*20).Take(20).ToListAsync(ct),total,page,pageSize=20};
    }
    public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,Guid? rackId,int page,CancellationToken ct,Guid? productId=null,Guid? locationId=null)
    {
        if(kind.StartsWith("move-",StringComparison.Ordinal)) return await MoveChoices(tenant,kind,search,productId,warehouseId,rackId,locationId,page,ct);
        Page(page,20);if(search?.Length>100)throw Error("검색어는 100자까지 입력해 주세요.");
        var term=search?.Trim().ToLowerInvariant()??"";
        IQueryable<Choice> q=kind switch {
            "products"=>db.Products.Where(x=>x.TenantId==tenant&&x.IsActive).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name,Unit=x.Unit,LotManaged=x.LotManaged,ExpiryManaged=x.ExpiryManaged,SerialManaged=x.SerialManaged}),
            "warehouse-filter"=>db.Warehouses.Where(x=>x.TenantId==tenant).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "location-filter"=>db.StorageLocations.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&(!rackId.HasValue||x.RackId==rackId)).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "warehouses"=>db.Warehouses.Where(x=>x.TenantId==tenant&&x.IsActive).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "active-racks"=>db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&x.IsActive&&db.Warehouses.Any(w=>w.TenantId==tenant&&w.Id==x.WarehouseId&&w.IsActive)&&(x.ZoneId==null||db.WarehouseZones.Any(z=>z.TenantId==tenant&&z.WarehouseId==x.WarehouseId&&z.Id==x.ZoneId&&z.IsActive))).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "racks"=>db.WarehouseRacks.Where(x=>x.TenantId==tenant&&(!warehouseId.HasValue||x.WarehouseId==warehouseId)).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "locations"=>ActiveLocations(tenant).Where(x=>x.WarehouseId==warehouseId&&(!rackId.HasValue||x.RackId==rackId)).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
            "stocks"=>Rows(tenant).Where(x=>x.IsActive).Select(x=>new Choice{Id=x.Id,Code=x.ProductCode,Name=x.ProductName+" / "+x.WarehouseName+" / "+x.LocationCode+" / "+(x.LotNumber??"")+" "+(x.SerialNumber??""),Unit=x.Unit,SerialManaged=x.SerialManaged}),
            _=>throw Error("선택 항목을 확인해 주세요.")};
        if(term!="")q=q.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term));var total=await q.CountAsync(ct);
        return new{items=await q.OrderBy(x=>x.Code).ThenBy(x=>x.Id).Skip((page-1)*30).Take(30).ToListAsync(ct),total,page};
    }
    public sealed class Choice { public Guid Id{get;set;} public string Code{get;set;}="";public string Name{get;set;}="";public string? Unit{get;set;}public bool LotManaged{get;set;}public bool ExpiryManaged{get;set;}public bool SerialManaged{get;set;} }

    public async Task<object> Execute(Guid tenant,Guid actor,InventoryRequest r,bool move,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{move,request=r}))));
        if(r.RequestId==Guid.Empty)throw Error("처리 요청 번호를 확인해 주세요.");
        var replay=await db.InventoryOperations.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);
        if(replay!=null){if(replay.RequestHash!=hash)throw Error("동일 요청 번호의 처리 내용이 다릅니다. 기존 내역을 확인해 주세요.",409);await tx.CommitAsync(ct);return await Operation(tenant,replay.Id,ct);}
        if(r.Quantity<=0||r.Quantity>999999999.999m||decimal.Round(r.Quantity,3)!=r.Quantity||string.IsNullOrWhiteSpace(r.Reason)||r.Reason.Length>300||r.Notes?.Length>2000||r.OccurredAt==default||r.OccurredAt>clock.GetUtcNow().AddMinutes(5))throw Error("수량·처리일시·필수 사유를 확인해 주세요. 수량은 소수점 3자리까지 입력할 수 있습니다.");
        StockBalance? source=null,destination=null;
        if(r.StockId.HasValue){source=await db.StockBalances.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==r.StockId,ct)??throw Error("재고를 찾을 수 없습니다.",404);if(r.Version==Guid.Empty||source.Version!=r.Version)throw Error("재고가 변경되었습니다. 상세를 다시 열어 주세요.",409);if(r.ProductId.HasValue||r.LotNumber!=null||r.ExpiryDate.HasValue||r.SerialNumber!=null)throw Error("기존 재고의 상품·LOT·시리얼은 변경할 수 없습니다.");}
        else if(move||!r.Increase)throw Error("이동·감소할 기존 재고를 선택해 주세요.");
        var product=await products.LockForInventory(tenant,source?.ProductId??r.ProductId??Guid.Empty,ct);
        if(source!=null){await Location(tenant,source.WarehouseId,source.LocationId,ct);if(source.Unit!=product.Unit)throw Error("기존 재고의 단위·추적 정보를 확인해 주세요.",409);}
        IebleWms.Api.Products.ProductPackaging.ValidateEach(r.Quantity,product.Unit);
        var assignee=await BusinessAssignees.Resolve(db,tenant,actor,r.ContactUserId,true,null,null,ct);
        var op=new InventoryOperation{TenantId=tenant,ContactUserId=assignee.Id,ContactName=assignee.Name,Type=move?"Move":r.Increase?"Increase":"Decrease",Number=await IebleWms.Api.Services.BusinessCodes.Next(db,tenant,move?"MV":"AD",ct),ProductId=product.Id,ProductCode=product.Code,ProductName=product.Name,Unit=product.Unit,Quantity=r.Quantity,Reason=r.Reason.Trim(),Notes=r.Notes?.Trim(),ActorId=actor,ActorName=await db.Users.Where(x=>x.Id==actor).Select(x=>x.DisplayName).SingleOrDefaultAsync(ct)??"",OccurredAt=r.OccurredAt.ToUniversalTime(),CreatedAt=clock.GetUtcNow(),RequestId=r.RequestId,RequestHash=hash};
        var before=new List<object>();if(source!=null)before.Add(Snapshot(source));
        if(move) {
            var from=source!;var target=await Location(tenant,r.WarehouseId??Guid.Empty,r.LocationId??Guid.Empty,ct);
            if(from.WarehouseId==target.WarehouseId&&from.LocationId==target.Id)throw Error("출발 위치와 도착 위치가 같습니다.");
            if(r.Quantity>from.Quantity-from.ReservedQuantity)throw Error("출고 가능 수량을 초과하여 이동할 수 없습니다. 예약 재고는 이동 대상에서 제외됩니다.",409);
            op.SourceStockId=from.Id;op.SourceWarehouseId=from.WarehouseId;op.SourceLocationId=from.LocationId;op.SourceLabel=await Label(tenant,from.WarehouseId,from.LocationId,ct);op.BeforeSource=from.Quantity;op.AfterSource=from.Quantity-r.Quantity;
            if(from.SerialNumber!=null){if(r.Quantity!=1||from.Quantity!=1||from.ReservedQuantity!=0)throw Error("시리얼은 예약되지 않은 1개 재고만 이동할 수 있습니다.",409);destination=from;from.WarehouseId=target.WarehouseId;from.LocationId=target.Id;op.BeforeDestination=0;op.AfterDestination=1;}
            else {
                destination=await db.StockBalances.Where(x=>x.TenantId==tenant&&x.WarehouseId==target.WarehouseId&&x.LocationId==target.Id&&x.ProductId==from.ProductId&&x.Unit==from.Unit&&x.LotNumber==from.LotNumber&&x.ExpiryDate==from.ExpiryDate&&x.SerialNumber==null&&x.ReceiptLineId==from.ReceiptLineId).OrderBy(x=>x.Id).FirstOrDefaultAsync(ct);
                if(destination==null){destination=new(){TenantId=tenant,WarehouseId=target.WarehouseId,LocationId=target.Id,ProductId=product.Id,Unit=from.Unit,LotNumber=from.LotNumber,ExpiryDate=from.ExpiryDate,ReceiptLineId=from.ReceiptLineId,SourceKey=$"MOVE:{op.Id:N}"};db.StockBalances.Add(destination);}else before.Add(Snapshot(destination));
                op.BeforeDestination=destination.Quantity;destination.Quantity+=r.Quantity;from.Quantity-=r.Quantity;op.AfterDestination=destination.Quantity;
            }
            op.DestinationStockId=destination.Id;op.DestinationWarehouseId=target.WarehouseId;op.DestinationLocationId=target.Id;op.DestinationLabel=await Label(tenant,target.WarehouseId,target.Id,ct);
            if(op.BeforeSource+op.BeforeDestination!=op.AfterSource+op.AfterDestination)throw Error("이동 전후 총재고가 일치하지 않습니다.",409);
            Movement(op,from.Id,"MoveOut",-r.Quantity);Movement(op,destination.Id,"MoveIn",r.Quantity);
        } else {
            if(source==null) {
                var target=await Location(tenant,r.WarehouseId??Guid.Empty,r.LocationId??Guid.Empty,ct);var lot=Text(r.LotNumber);var serial=Text(r.SerialNumber);
                if(r.ExpiryDate==default(DateOnly)||(serial!=null&&r.Quantity!=1))throw Error("상품의 LOT·유통기한·시리얼 정책을 확인해 주세요. 시리얼은 한 번에 1개씩 등록합니다.");
                if(serial!=null&&await db.StockBalances.AnyAsync(x=>x.TenantId==tenant&&x.ProductId==product.Id&&x.SerialNumber==serial,ct))throw Error("이미 등록된 시리얼입니다. 수량이 0인 경우에도 기존 재고 행을 선택해 주세요.",409);
                if(await db.StockBalances.AnyAsync(x=>x.TenantId==tenant&&x.ProductId==product.Id&&x.WarehouseId==target.WarehouseId&&x.LocationId==target.Id&&x.LotNumber==lot&&x.ExpiryDate==r.ExpiryDate&&x.SerialNumber==serial,ct))throw Error("같은 위치·추적 정보의 재고 행이 있습니다. 수량이 0이어도 기존 행을 선택해 주세요.",409);
                source=new(){TenantId=tenant,WarehouseId=target.WarehouseId,LocationId=target.Id,ProductId=product.Id,Unit=product.Unit,LotNumber=lot,ExpiryDate=r.ExpiryDate,SerialNumber=serial,SourceKey=$"ADJ:{op.Id:N}"};db.StockBalances.Add(source);
            }else if(r.WarehouseId.HasValue||r.LocationId.HasValue)throw Error("기존 재고의 위치 변경은 재고 이동을 사용해 주세요.");
            var after=source.Quantity+(r.Increase?r.Quantity:-r.Quantity);
            if(after<source.ReservedQuantity)throw Error("조정 후 재고가 출고 예정 수량보다 작을 수 없습니다.",409);
            if(source.SerialNumber!=null&&(r.Quantity!=1||after is <0 or >1))throw Error("시리얼 재고는 0 또는 1개만 유지할 수 있습니다.",409);
            op.SourceStockId=source.Id;op.SourceWarehouseId=source.WarehouseId;op.SourceLocationId=source.LocationId;op.SourceLabel=await Label(tenant,source.WarehouseId,source.LocationId,ct);op.BeforeSource=source.Quantity;op.AfterSource=after;source.Quantity=after;
            Movement(op,source.Id,r.Increase?"AdjustmentIncrease":"AdjustmentDecrease",r.Increase?r.Quantity:-r.Quantity);
        }
        var tracked=source!;op.LotNumber=tracked.LotNumber;op.ExpiryDate=tracked.ExpiryDate;op.SerialNumber=tracked.SerialNumber;
        db.InventoryOperations.Add(op);db.InventoryChanges.Add(new(){TenantId=tenant,OperationId=op.Id,ActorId=actor,CreatedAt=clock.GetUtcNow(),BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(new{operation=op,source=Snapshot(source!),destination=destination==null?null:Snapshot(destination)})});
        try{await db.SaveChangesAsync(ct);}catch(DbUpdateConcurrencyException){throw Error("다른 작업이 재고를 변경했습니다. 다시 조회해 주세요.",409);}catch(DbUpdateException){throw Error("재고 수량·시리얼·참조 정보 충돌로 처리하지 못했습니다. 기존 데이터는 유지됩니다.",409);}
        await tx.CommitAsync(ct);return await Operation(tenant,op.Id,ct);
    }
    void Movement(InventoryOperation o,Guid stock,string type,decimal quantity)=>db.StockMovements.Add(new(){TenantId=o.TenantId,StockId=stock,OperationId=o.Id,Type=type,Quantity=quantity,ActorId=o.ActorId,CreatedAt=o.CreatedAt});
    async Task<StorageLocation> Location(Guid tenant,Guid warehouse,Guid location,CancellationToken ct)=>await ActiveLocations(tenant).SingleOrDefaultAsync(x=>x.WarehouseId==warehouse&&x.Id==location,ct)??throw Error("같은 기업의 활성 창고·랙·보관 위치를 선택해 주세요.");
    async Task<string> Label(Guid tenant,Guid warehouse,Guid location,CancellationToken ct){var l=await db.StorageLocations.SingleAsync(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.Id==location,ct);var w=await db.Warehouses.Where(x=>x.TenantId==tenant&&x.Id==warehouse).Select(x=>x.Name).SingleAsync(ct);var rack=l.RackId.HasValue?await db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouse&&x.Id==l.RackId).Select(x=>x.Code).SingleAsync(ct):"바닥";return $"{w} / {rack} / {l.Code}";}
    static object Snapshot(StockBalance s)=>JsonSerializer.SerializeToElement(s);
    static string? Text(string? value){if(string.IsNullOrWhiteSpace(value))return null;var s=value.Trim();if(s.Length>100||s.Any(char.IsControl))throw Error("추적 정보 형식을 확인해 주세요.");return s;}
    static void Page(int page,int size){if(page<1||page>100000||size is not (20 or 50 or 100))throw Error("페이지 조건을 확인해 주세요.");}
    static OrganizationException Error(string message,int status=400)=>new(status,message);
}
