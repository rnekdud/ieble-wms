using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Support;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;

public sealed partial class ProductService
{
    Task<string> NextCode(Guid tenant,CancellationToken ct) => IebleWms.Api.Services.BusinessCodes.Next(db,tenant,"PR",ct);
    public async Task<ProductCategory> SaveCategory(Guid tenant,Guid actor,Guid? id,ProductCategoryRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);
        if(id.HasValue && DefaultProductClassification.IsCategory(tenant,id.Value)) throw Error(409,"기본 제공 카테고리는 수정할 수 없습니다. 기업 전용 카테고리를 추가해 주세요.");
        var systemCategory=DefaultProductClassification.CategoryRows(tenant).FirstOrDefault(x=>x.Name==r.Name.Trim()&&x.ParentId==r.ParentId);
        if(systemCategory!=null && (!id.HasValue || !await db.ProductCategories.AnyAsync(x=>x.TenantId==tenant&&x.Id==id&&x.Name==systemCategory.Name&&x.ParentId==r.ParentId,ct))) throw Error(409,"동일한 기본 제공 카테고리가 있습니다. 기본 항목을 선택해 주세요.");
        await MaterializeClassification(tenant,actor,r.ParentId,null,ct);
        var name=Text(r.Name,100,"카테고리명");var normalized=name.ToUpperInvariant();
        var all=await db.ProductCategories.Where(x=>x.TenantId==tenant).ToListAsync(ct);
        var item=id.HasValue?all.SingleOrDefault(x=>x.Id==id)??throw Error(404,"카테고리를 찾을 수 없습니다."):new ProductCategory{TenantId=tenant};
        if(id.HasValue&&item.Version!=r.Version)throw Error(409,"카테고리가 변경되었습니다. 다시 조회해 주세요.");
        var duplicate=all.FirstOrDefault(x=>x.NormalizedName==normalized&&x.Id!=item.Id);
        if(duplicate!=null) {
            if(!id.HasValue&&duplicate.ParentId==r.ParentId&&duplicate.IsActive==r.IsActive){await tx.CommitAsync(ct);return duplicate;}
            throw Error(409,"이미 사용 중인 카테고리명입니다.");
        }
        var before=new{item.Name,item.ParentId,item.IsActive};
        if(r.ParentId.HasValue&&!all.Any(x=>x.Id==r.ParentId&&x.IsActive))throw Error(400,"사용 가능한 상위 카테고리를 선택해 주세요.");
        item.Name=name;item.NormalizedName=normalized;item.ParentId=r.ParentId;item.IsActive=r.IsActive;
        if(!id.HasValue)all.Add(item);
        // Validate every subtree after a move: no cycles, foreign parents or fourth level.
        var map=all.ToDictionary(x=>x.Id);
        foreach(var c in all){var seen=new HashSet<Guid>();var node=c;var depth=0;while(true){if(!seen.Add(node.Id)||++depth>3)throw Error(400,"카테고리는 순환 없이 최대 3단계까지 지정할 수 있습니다.");if(!node.ParentId.HasValue)break;if(!map.TryGetValue(node.ParentId.Value,out node!))throw Error(400,"상위 카테고리를 확인해 주세요.");}}
        if(!id.HasValue)db.ProductCategories.Add(item);
        Audit(tenant,actor,item.Id,id.HasValue?"CategoryUpdated":"CategoryCreated",before,new{item.Name,item.ParentId,item.IsActive});await Save(ct);await tx.CommitAsync(ct);return item;
    }
    public async Task<ProductType> SaveType(Guid tenant,Guid actor,Guid? id,ProductCategoryRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);
        if(id.HasValue && DefaultProductClassification.IsType(tenant,id.Value)) throw Error(409,"기본 제공 상품 구분은 수정할 수 없습니다. 기업 전용 구분을 추가해 주세요.");
        var name=Text(r.Name,100,"상품 구분");var normalized=name.ToUpperInvariant();
        var item=id.HasValue?await db.ProductTypes.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error(404,"상품 구분을 찾을 수 없습니다."):new ProductType{TenantId=tenant};
        if(DefaultProductClassification.Types.Contains(name)&&(!id.HasValue||item.Name!=name)) throw Error(409,"동일한 기본 제공 상품 구분이 있습니다. 기본 항목을 선택해 주세요.");
        if(id.HasValue&&item.Version!=r.Version)throw Error(409,"상품 구분이 변경되었습니다. 다시 조회해 주세요.");
        if(await db.ProductTypes.AnyAsync(x=>x.TenantId==tenant&&x.NormalizedName==normalized&&x.Id!=item.Id,ct))throw Error(409,"이미 사용 중인 상품 구분입니다.");
        var before=new{item.Name,item.IsActive};item.Name=name;item.NormalizedName=normalized;item.IsActive=r.IsActive;
        if(!id.HasValue)db.ProductTypes.Add(item);Audit(tenant,actor,item.Id,id.HasValue?"ProductTypeUpdated":"ProductTypeCreated",before,new{item.Name,item.IsActive});await Save(ct);await tx.CommitAsync(ct);return item;
    }
    async Task MasterFields(Product p,ProductRequest r,CancellationToken ct)
    {
        static string? Optional(string? value,int max,string label)=>string.IsNullOrWhiteSpace(value)?null:Text(value,max,label);
        p.ModelNumber=Optional(r.ModelNumber,100,"모델 번호");p.Origin=Optional(r.Origin,100,"원산지");
        if(r.ProductTypeId.HasValue&&!await db.ProductTypes.AnyAsync(x=>x.TenantId==p.TenantId&&x.Id==r.ProductTypeId&&(x.IsActive||x.Id==p.ProductTypeId),ct))throw Error(400,"상품 구분을 확인해 주세요.");
        p.ProductTypeId=r.ProductTypeId;
        p.InnerPackQuantity=r.InnerPackQuantity;p.OuterPackQuantity=r.OuterPackQuantity;p.OuterPackUnit=r.OuterPackUnit;p.PalletPackQuantity=r.PalletPackQuantity;
        ProductPackaging.Validate(p);
        // Existing barcode links must remain valid even when the caller keeps its barcode collection unchanged.
        foreach(var package in await db.StorageBarcodes.Where(x=>x.TenantId==p.TenantId&&x.ProductId==p.Id).Select(x=>x.PackageCode).Distinct().ToListAsync(ct))
            if(r.Barcodes==null) ProductPackaging.Factor(p,package);
        if(r.CategoryId.HasValue&&(db.Entry(p).State==EntityState.Detached||r.CategoryId!=db.Entry(p).Property(x=>x.CategoryId).OriginalValue)){
            var node=r.CategoryId;for(var depth=0;node.HasValue&&depth<3;depth++){var c=await db.ProductCategories.SingleOrDefaultAsync(x=>x.TenantId==p.TenantId&&x.Id==node&&x.IsActive,ct)??throw Error(400,"사용 중인 카테고리를 선택해 주세요.");node=c.ParentId;}
        }
        foreach(var n in new[]{r.CostPrice,r.RetailPrice})if(n is decimal v&&(v<0||v>999999999999.99m||decimal.Round(v,2)!=v))throw Error(400,"금액은 0 이상, 소수점 2자리 이내로 입력해 주세요.");
        foreach(var n in new[]{r.WeightGrams,r.WidthCm,r.DepthCm,r.HeightCm,r.BoxWeightGrams,r.BoxWidthCm,r.BoxDepthCm,r.BoxHeightCm})if(n is decimal v&&(v<0||v>999999999.999999m||decimal.Round(v,6)!=v))throw Error(400,"무게와 규격은 0 이상, 소수점 6자리 이내로 입력해 주세요.");
        if(r.Currency!="KRW")throw Error(400,"현재 지원하는 기준 통화는 KRW입니다.");
        p.CostPrice=r.CostPrice;p.RetailPrice=r.RetailPrice;p.Currency=r.Currency;p.WeightGrams=r.WeightGrams;p.WidthCm=r.WidthCm;p.DepthCm=r.DepthCm;p.HeightCm=r.HeightCm;p.BoxWeightGrams=r.BoxWeightGrams;p.BoxWidthCm=r.BoxWidthCm;p.BoxDepthCm=r.BoxDepthCm;p.BoxHeightCm=r.BoxHeightCm;
    }
    async Task SaveBarcodes(Product p,ProductBarcodeRequest[] requests,Guid actor,CancellationToken ct)
    {
        if(requests.Length>30||requests.Count(x=>x.IsPrimary)>1)throw Error(400,"바코드는 최대 30개, 대표 바코드는 최대 1개입니다.");
        var old=await db.StorageBarcodes.Where(x=>x.TenantId==p.TenantId&&x.ProductId==p.Id).ToListAsync(ct);
        var result=new List<StorageBarcode>();var ids=new HashSet<Guid>();var values=new HashSet<string>(StringComparer.Ordinal);
        foreach(var r in requests){
            var previous=r.Id.HasValue?old.SingleOrDefault(x=>x.Id==r.Id)??throw Error(400,"상품에 속한 바코드를 선택해 주세요."):null;
            if(r.Id.HasValue&&!ids.Add(r.Id.Value))throw Error(400,"중복된 바코드 행입니다.");
            BarcodeChangePolicy.Validate(r.Change,"상품 바코드");var mode=r.Change.Mode;
            var value=mode=="keep"?previous?.Value:r.Change.Value;
            if(mode=="none"||string.IsNullOrEmpty(value))throw Error(400,"빈 바코드 행은 삭제하거나 값을 입력해 주세요.");
            var generated=mode=="auto"||(value==previous?.Value&&previous.IsGenerated);
            if(mode=="auto")candidates.Verify(p.TenantId,"product",value,r.Change.Proof);
            if(r.BarcodeType is not ("Internal" or "External")||(generated&&r.BarcodeType!="Internal"))throw Error(400,"자동 생성 번호는 내부 관리용 Code 128입니다.");
            if(r.Description?.Length>200||r.Description?.Any(char.IsControl)==true)throw Error(400,"바코드 설명은 200자 이내로 입력해 주세요.");
            if(!values.Add(value))throw Error(409,"동일한 바코드를 여러 번 등록할 수 없습니다.");
            if(await db.StorageBarcodes.AnyAsync(x=>x.Value==value&&(x.ProductId==null||x.ProductId!=p.Id)&&(x.TenantId==p.TenantId||generated||x.IsGenerated),ct))throw Error(409,"이미 사용 중인 상품·랙·보관 위치 바코드입니다.");
            ProductPackaging.Factor(p,r.PackageCode);
            result.Add(new(){PackageCode=r.PackageCode,Id=previous?.Id??Guid.NewGuid(),TenantId=p.TenantId,ProductId=p.Id,Value=value,IsGenerated=generated,IsPrimary=r.IsPrimary,Description=r.Description?.Trim(),BarcodeType=r.BarcodeType,CreatedAt=previous==null?clock.GetUtcNow():previous.CreatedAt,UpdatedAt=previous==null||previous.Value!=value||previous.IsPrimary!=r.IsPrimary||previous.Description!=r.Description?.Trim()||previous.BarcodeType!=r.BarcodeType||previous.PackageCode!=r.PackageCode?clock.GetUtcNow():previous.UpdatedAt});
        }
        // Release old keys before swaps, inside the SAME transaction; a failure restores all rows.
        if(old.Count>0){db.StorageBarcodes.RemoveRange(old);await Save(ct);}
        db.StorageBarcodes.AddRange(result);
        var primary=result.FirstOrDefault(x=>x.IsPrimary);p.Barcode=primary?.Value;p.BarcodeIsGenerated=primary?.IsGenerated??false;p.BarcodeType=primary?.BarcodeType??"Internal";p.Barcodes=result;
        if(actor!=Guid.Empty)Audit(p.TenantId,actor,p.Id,"ProductBarcodesChanged",old,result);
    }
}
