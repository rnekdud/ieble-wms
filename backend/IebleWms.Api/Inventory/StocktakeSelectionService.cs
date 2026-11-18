using IebleWms.Api.Organization;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Inventory;

public sealed partial class StocktakeService
{
    public async Task<object> Candidates(Guid tenant,Guid warehouseId,Guid? rackId,string? search,int page,CancellationToken ct,Guid? productId=null)
    {
        if(page is <1 or >100000||search?.Length>100)throw Error("상품 검색·페이지 조건을 확인해 주세요.");
        if(!await db.Warehouses.AnyAsync(w=>w.TenantId==tenant&&w.Id==warehouseId&&w.IsActive,ct))throw Error("활성 창고를 선택해 주세요.");
        var locations=inventory.ActiveLocations(tenant).Where(l=>l.WarehouseId==warehouseId&&(!rackId.HasValue||l.RackId==rackId));
        var q=from stock in db.StockBalances.AsNoTracking()
              join product in db.Products on new{stock.TenantId,Id=stock.ProductId} equals new{product.TenantId,product.Id}
              join location in locations on stock.LocationId equals location.Id
              where stock.TenantId==tenant&&stock.WarehouseId==warehouseId&&product.IsActive&&(!productId.HasValue||product.Id==productId)
              select new{stock,product,location};
        var term=search?.Trim().ToLowerInvariant()??"";
        if(term!="")q=q.Where(x=>x.product.Code.ToLower().Contains(term)||x.product.Name.ToLower().Contains(term)||x.location.Code.ToLower().Contains(term)||db.WarehouseRacks.Any(r=>r.TenantId==tenant&&r.Id==x.location.RackId&&(r.Name.ToLower().Contains(term)||r.Code.ToLower().Contains(term)))||(x.stock.LotNumber!=null&&x.stock.LotNumber.ToLower().Contains(term))||(x.stock.SerialNumber!=null&&x.stock.SerialNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.product.Id&&b.Value.ToLower().Contains(term)));
        var total=await q.CountAsync(ct);page=Page(page,total);
        var items=await q.OrderBy(x=>x.product.Code).ThenBy(x=>x.location.Code).ThenBy(x=>x.stock.Id).Skip((page-1)*20).Take(20).Select(x=>new {
            id=x.stock.Id,stockId=x.stock.Id,stockVersion=x.stock.Version,productId=x.product.Id,productName=x.product.Name,productCode=x.product.Code,
            warehouseId=x.stock.WarehouseId,warehouseName=db.Warehouses.Where(w=>w.TenantId==tenant&&w.Id==warehouseId).Select(w=>w.Name).First(),
            locationId=x.location.Id,locationCode=x.location.Code,rackId=x.location.RackId,rackCode=db.WarehouseRacks.Where(r=>r.TenantId==tenant&&r.Id==x.location.RackId).Select(r=>r.Code).FirstOrDefault(),
            unit=x.stock.Unit,baselineQuantity=x.stock.Quantity,baselineReserved=x.stock.ReservedQuantity,x.stock.LotNumber,x.stock.ExpiryDate,x.stock.SerialNumber,
            barcode=db.StorageBarcodes.Where(b=>b.TenantId==tenant&&b.ProductId==x.product.Id).OrderByDescending(b=>b.IsPrimary).ThenBy(b=>b.Id).Select(b=>b.Value).FirstOrDefault()
        }).ToListAsync(ct);
        return new{items,total,page,pageSize=20};
    }
    public async Task<object> Selection(Guid tenant,Guid actor,Guid id,StocktakeSelectionRequest r,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);var d=await Document(tenant,id,ct);Check(d,r.Version,"Counting");
        if(d.Scope!="Selected")throw Error("차이 상품 실사에서만 대상을 선택·삭제할 수 있습니다.");
        if(r.Add==null||r.Remove==null||r.Add.Length+r.Remove.Length is <1 or >100||r.Remove.Distinct().Count()!=r.Remove.Length)throw Error("변경할 실사 항목을 확인해 주세요.");
        foreach(var targetId in r.Remove){var target=await Targets(d).SingleOrDefaultAsync(t=>t.Id==targetId&&!t.Excluded,ct)??throw Error("실사 항목을 찾을 수 없습니다.",404);var before=Json(target);target.Excluded=true;await Log(d,actor,"RemovedTarget",before,target,ct,target.Id);}
        await AddSelected(d,actor,r.Add,ct);await Save(ct);await tx.CommitAsync(ct);return await Detail(tenant,id,ct);
    }
    public async Task<object> Draft(Guid tenant,Guid actor,Guid id,StocktakeDraftRequest r,CancellationToken ct)
    {
        await using var tx=await InventoryTransactions.Begin(db,tenant,ct);
        var d=await Document(tenant,id,ct);Check(d,r.Version,"Counting","Counted","Reviewing");
        if(d.Scope!="Selected")throw Error("선택 상품 실사에서만 임시 저장할 수 있습니다.");
        if(r.Items==null||r.Items.Length>100||r.Items.Any(x=>x==null||x.Selection==null))throw Error("실사 상품은 최대 100행까지 저장할 수 있습니다.");
        var ids=r.Items.Where(x=>x.TargetId.HasValue).Select(x=>x.TargetId!.Value).ToArray();
        if(ids.Distinct().Count()!=ids.Length)throw Error("동일 실사 항목이 중복되었습니다.");
        if(r.BasisAt==default||r.BasisAt>clock.GetUtcNow().AddMinutes(5))throw Error("실사일자를 확인해 주세요.");
        var targets=await Targets(d).Where(t=>!t.Excluded).ToListAsync(ct);
        if(ids.Any(id=>targets.All(t=>t.Id!=id)))throw Error("실사 항목이 변경되었습니다. 다시 조회해 주세요.",409);
        var before=Json(d);var assignee=await BusinessAssignees.Resolve(db,tenant,actor,r.ContactUserId,false,d.ContactUserId,d.ContactName,ct);d.ContactUserId=assignee.Id;d.Status="Counting";d.BasisAt=r.BasisAt.ToUniversalTime();d.BasisDate=DateOnly.FromDateTime(r.BasisAt.ToOffset(TimeSpan.FromHours(9)).Date);d.ContactName=assignee.Name;d.Notes=Text(r.Notes,2000);
        foreach(var target in targets.Where(t=>!ids.Contains(t.Id))){var old=Json(target);target.Excluded=true;await Log(d,actor,"RemovedTarget",old,target,ct,target.Id);}
        foreach(var item in r.Items.Where(x=>x.TargetId.HasValue)){
            var target=targets.Single(t=>t.Id==item.TargetId);var old=Json(target);
            // Identity and captured inventory baseline cannot be replaced by client input.
            SetSelectedCount(target,item.Selection,actor);await Log(d,actor,"Count",old,target,ct,target.Id);
        }
        await AddSelected(d,actor,r.Items.Where(x=>!x.TargetId.HasValue).Select(x=>x.Selection).ToArray(),ct);
        await Log(d,actor,"DraftSaved",before,d,ct);await Save(ct);await tx.CommitAsync(ct);
        return await Detail(tenant,id,ct);
    }
    void SetSelectedCount(StocktakeTarget target,StocktakeSelectionInput input,Guid actor)
    {
        Quantity(input.Quantity);if(input.Quantity.HasValue)IebleWms.Api.Products.ProductPackaging.ValidateEach(input.Quantity.Value,target.Unit);var observed=Text(input.ObservedSerial);
        if(target.SerialNumber!=null&&((input.Quantity.HasValue&&input.Quantity is not (0 or 1))||(input.Quantity==1&&observed!=target.SerialNumber)||(input.Quantity!=1&&observed!=null)))throw Error("시리얼별 실사 수량은 0 또는 1이며 실제 확인한 식별값이 필요합니다.");
        if(target.SerialNumber==null&&observed!=null)throw Error("시리얼 재고가 아닙니다.");
        target.CountedQuantity=input.Quantity;target.ObservedSerial=observed;target.Reason=Text(input.Reason,500);target.CountedBy=input.Quantity.HasValue?actor:null;target.CountedAt=input.Quantity.HasValue?clock.GetUtcNow():null;
    }
    async Task AddSelected(Stocktake d,Guid actor,StocktakeSelectionInput[] inputs,CancellationToken ct)
    {
        var existing=await Targets(d).ToListAsync(ct);
        if(existing.Count(t=>!t.Excluded)+inputs.Length>100)throw Error("간편 실사는 최대 100개 재고 행을 선택할 수 있습니다.");
        foreach(var input in inputs)
        {
            StocktakeTarget target;string before="{}";
            if(input.StockId.HasValue)
            {
                var stock=await db.StockBalances.SingleOrDefaultAsync(s=>s.TenantId==d.TenantId&&s.WarehouseId==d.WarehouseId&&s.Id==input.StockId,ct)??throw Error("선택한 재고를 찾을 수 없습니다.",404);
                if(!input.StockVersion.HasValue||stock.Version!=input.StockVersion)throw Error("선택 이후 재고·예약이 변경되었습니다. 상품을 다시 조회하고 수량을 확인해 주세요.",409);
                if(!await inventory.ActiveLocations(d.TenantId).AnyAsync(l=>l.WarehouseId==d.WarehouseId&&l.Id==stock.LocationId,ct)||!await db.Products.AnyAsync(p=>p.TenantId==d.TenantId&&p.Id==stock.ProductId&&p.IsActive,ct))throw Error("활성 상품·보관 위치를 선택해 주세요.");
                var old=existing.SingleOrDefault(t=>t.StockId==stock.Id);
                if(old is {Excluded:false})throw Error("이미 선택한 재고입니다. 기존 행을 수정해 주세요.",409);
                target=await Capture(d,stock,ct);
                if(old!=null){before=Json(old);old.Excluded=false;old.BaselineQuantity=target.BaselineQuantity;old.BaselineReserved=target.BaselineReserved;old.BaselineVersion=target.BaselineVersion;old.BaselineAt=target.BaselineAt;old.LocationId=target.LocationId;old.LocationCode=target.LocationCode;old.RackCode=target.RackCode;target=old;}
                else {db.StocktakeTargets.Add(target);existing.Add(target);}
            }
            else
            {
                var product=await products.LockForInventory(d.TenantId,input.ProductId,ct);
                var location=await inventory.ActiveLocations(d.TenantId).SingleOrDefaultAsync(l=>l.WarehouseId==d.WarehouseId&&l.Id==input.LocationId,ct)??throw Error("같은 창고의 활성 위치를 선택해 주세요.");
                if(input.ExpiryDate==default(DateOnly))throw Error("유통기한을 확인해 주세요.");
                target=new(){TenantId=d.TenantId,StocktakeId=d.Id,ProductId=product.Id,ProductName=product.Name,ProductCode=product.Code,Unit=product.Unit,WarehouseId=d.WarehouseId,LocationId=location.Id,LocationCode=location.Code,RackCode=await db.WarehouseRacks.Where(r=>r.TenantId==d.TenantId&&r.Id==location.RackId).Select(r=>r.Code).SingleOrDefaultAsync(ct)??"",LotNumber=Text(input.LotNumber),ExpiryDate=input.ExpiryDate,SerialNumber=Text(input.SerialNumber),IsUnregistered=true,OriginalSnapshotAt=clock.GetUtcNow(),BaselineAt=clock.GetUtcNow()};
                var stocks=await db.StockBalances.Where(s=>s.TenantId==d.TenantId&&s.ProductId==product.Id).ToListAsync(ct);
                if(stocks.Any(s=>SameKey(target,s))||existing.Any(t=>!t.Excluded&&t.ProductId==product.Id&&(target.SerialNumber!=null?t.SerialNumber==target.SerialNumber:t.LocationId==target.LocationId&&t.LotNumber==target.LotNumber&&t.ExpiryDate==target.ExpiryDate&&t.SerialNumber==null)))throw Error("동일 위치·추적 정보의 재고 또는 시리얼이 이미 있습니다. 전산 재고 목록에서 선택해 주세요.",409);
                db.StocktakeTargets.Add(target);existing.Add(target);
            }
            SetSelectedCount(target,input,actor);
            await Log(d,actor,"SelectedSnapshot",before,target,ct,target.Id);
        }
    }
}
