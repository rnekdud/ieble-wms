using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
namespace IebleWms.Api.Products;

public sealed partial class ProductService(WmsDbContext db,TimeProvider clock,InternalBarcodeCandidates candidates)
{
    public async Task<object> List(Guid tenant,string? search,Guid? categoryId,string status,int page,int pageSize,CancellationToken ct)
    {
        if(search?.Length>100||status is not ("all" or "active" or "inactive")||page is <1 or >100000||pageSize is not (20 or 50 or 100)) throw Error(400,"검색 조건을 확인해 주세요.");
        var q=db.Products.AsNoTracking().Where(x=>x.TenantId==tenant);
        if(!string.IsNullOrWhiteSpace(search)) { var term=search.Trim().ToLowerInvariant();q=q.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.ModelNumber!=null&&x.ModelNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.Id&&b.Value.ToLower().Contains(term))||db.StockBalances.Any(s=>s.TenantId==tenant&&s.ProductId==x.Id&&((s.LotNumber!=null&&s.LotNumber.ToLower().Contains(term))||(s.SerialNumber!=null&&s.SerialNumber.ToLower().Contains(term))))); }
        if(categoryId.HasValue) {
            var categories=await CategoryOptions(tenant,ct);
            var ids=new HashSet<Guid>{categoryId.Value};for(var i=0;i<2;i++)foreach(var c in categories.Where(c=>c.ParentId.HasValue&&ids.Contains(c.ParentId.Value)).ToArray())ids.Add(c.Id);
            q=q.Where(x=>x.CategoryId.HasValue&&ids.Contains(x.CategoryId.Value));
        }
        if(status!="all") q=q.Where(x=>x.IsActive==(status=="active"));
        var total=await q.CountAsync(ct);
        var items=await q.OrderBy(x=>x.NormalizedCode).ThenBy(x=>x.Id).Skip((page-1)*pageSize).Take(pageSize)
            .Select(x=>new {product=x,productTypeName=db.ProductTypes.Where(t=>t.TenantId==tenant&&t.Id==x.ProductTypeId).Select(t=>t.Name).FirstOrDefault(),categoryName=db.ProductCategories.Where(c=>c.TenantId==tenant&&c.Id==x.CategoryId).Select(c=>c.Name).FirstOrDefault()}).ToListAsync(ct);
        return new {items,total,page,pageSize};
    }
    public async Task<object> Detail(Guid tenant,Guid id,CancellationToken ct,bool canViewCost=false)
    {
        var p=await Find(tenant,id,ct);
        var categoryName=await db.ProductCategories.Where(x=>x.TenantId==tenant&&x.Id==p.CategoryId).Select(x=>x.Name).FirstOrDefaultAsync(ct);
        p.AuthorizedCostPrice=canViewCost?p.CostPrice:null;
        p.Barcodes=await db.StorageBarcodes.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ProductId==id).OrderByDescending(x=>x.IsPrimary).ThenBy(x=>x.Id).ToListAsync(ct);
        p.Images=await ImageMetadata(tenant,id,ct);
        var productTypeName=await db.ProductTypes.Where(x=>x.TenantId==tenant&&x.Id==p.ProductTypeId).Select(x=>x.Name).SingleOrDefaultAsync(ct);
        return new {product=p,categoryName,productTypeName,canViewCost};
    }
    public Task<RackBarcodeCandidate> GenerateBarcode(Guid tenant,CancellationToken ct)=>candidates.Generate(db,tenant,"product",value=>db.StorageBarcodes.AnyAsync(x=>x.Value==value,ct));
    public Task<ProductCategory> Category(Guid tenant,Guid actor,ProductCategoryRequest request,CancellationToken ct)=>SaveCategory(tenant,actor,null,request,ct);
    public async Task<Product> SaveProduct(Guid tenant,Guid actor,Guid? id,ProductRequest r,CancellationToken ct)
    {
        await using var tx=db.Database.CurrentTransaction==null?await Begin(tenant,ct):null;
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r))));
        if(!id.HasValue)
        {
            if(r.RequestId==Guid.Empty) throw Error(400,"등록 요청 번호를 확인해 주세요.");
            var replay=await db.Products.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.CreationRequestId==r.RequestId,ct);
            if(replay!=null) { if(replay.CreationHash!=hash) throw Error(409,"같은 등록 요청의 내용이 달라졌습니다. 목록에서 기존 상품을 확인해 주세요.");if(tx!=null)await tx.CommitAsync(ct);replay.Images=await ImageMetadata(tenant,replay.Id,ct);return replay; }
        }
        var p=id.HasValue?await Find(tenant,id.Value,ct):new Product{TenantId=tenant,CreationRequestId=r.RequestId,CreationHash=hash};
        if(id.HasValue) { CheckVersion(p,r.Version); db.Entry(p).Property(x=>x.UpdatedAt).IsModified=true; }
        var before=id.HasValue?Snapshot(p):JsonSerializer.SerializeToElement(new{});
        var code=string.IsNullOrWhiteSpace(r.Code)?(id.HasValue?p.Code:await NextCode(tenant,ct)):Text(r.Code,64,"상품코드"); var normalizedCode=code.ToUpperInvariant();
        var name=Text(r.Name,200,"상품명");
        var unit=id.HasValue?p.Unit:"EA";
        if(!id.HasValue && ProductUnits.Normalize(r.Unit)!="EA") throw Error(400,"신규 상품은 개(EA)로 등록합니다. 박스 수량은 포장 설정을 사용해 주세요.");
        if(id.HasValue && ProductUnits.Normalize(r.Unit)!=p.Unit) throw Error(409,"기존 상품의 수량 단위는 자동 변경할 수 없습니다. 별도 이관 기준을 확인해 주세요.");
        if(r.SafetyStock is decimal safety && (safety<0||safety>999999999.999m||decimal.Round(safety,3)!=safety)) throw Error(400,"안전재고는 0 이상, 소수점 3자리 이내로 입력해 주세요.");
        await MaterializeClassification(tenant,actor,r.CategoryId,r.ProductTypeId,ct);
        if(r.CategoryId.HasValue&&!await db.ProductCategories.AnyAsync(x=>x.TenantId==tenant&&x.Id==r.CategoryId&&(x.IsActive||p.CategoryId==x.Id),ct)) throw Error(400,"선택한 상품 분류를 확인해 주세요.");
        if(p.TrackingLockedAt.HasValue&&unit!=p.Unit) throw Error(409,"재고·입출고에 사용된 상품의 기준 단위는 변경할 수 없습니다.");
        if(await db.Products.AnyAsync(x=>x.TenantId==tenant&&x.NormalizedCode==normalizedCode&&x.Id!=p.Id,ct)) throw Error(409,"현재 기업에서 이미 사용 중인 상품코드입니다.");
        await IebleWms.Api.Services.BusinessCodes.ObserveProduct(db,tenant,normalizedCode,ct);
        p.Code=code;p.NormalizedCode=normalizedCode;p.Name=name;p.CategoryId=r.CategoryId;p.Unit=unit;
        if(!id.HasValue){p.LotManaged=r.LotManaged;p.ExpiryManaged=r.ExpiryManaged;p.SerialManaged=r.SerialManaged;}p.SafetyStock=r.SafetyStock;p.IsActive=r.IsActive;p.Notes=string.IsNullOrWhiteSpace(r.Notes)?null:r.Notes.Trim();
        if(p.Notes?.Length>2000) throw Error(400,"비고는 2,000자 이내로 입력해 주세요.");
        await MasterFields(p,r,ct);
        await SaveImages(p,r,actor,ct);
        if(r.Barcodes!=null) await SaveBarcodes(p,r.Barcodes,actor,ct);
        else await Barcode(p,r.Barcode,r.BarcodeType,ct);
        if(!id.HasValue) db.Products.Add(p);
        Audit(tenant,actor,p.Id,id.HasValue?"ProductUpdated":"ProductCreated",before,Snapshot(p));
        await Save(ct);if(tx!=null)await tx.CommitAsync(ct);p.Images=await ImageMetadata(tenant,p.Id,ct);p.AuthorizedCostPrice=p.CostPrice;return p;
    }
    public async Task<Product> Status(Guid tenant,Guid actor,Guid id,ProductStatusRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var p=await Find(tenant,id,ct);CheckVersion(p,r.Version);
        var before=Snapshot(p);p.IsActive=r.IsActive;Audit(tenant,actor,p.Id,"ProductStatusChanged",before,Snapshot(p));
        await Save(ct);await tx.CommitAsync(ct);return p;
    }
    async Task Barcode(Product p,RackBarcodeChange? change,string type,CancellationToken ct)
    {
        var existing=await db.StorageBarcodes.AsNoTracking().Where(x=>x.TenantId==p.TenantId&&x.ProductId==p.Id).ToListAsync(ct);
        if((change?.Mode??"keep")=="keep") {p.Barcodes=existing;return;}
        var primary=existing.FirstOrDefault(x=>x.IsPrimary)??existing.FirstOrDefault();
        var requests=existing.Where(x=>x.Id!=primary?.Id).Select(x=>new ProductBarcodeRequest{Id=x.Id,IsPrimary=false,Description=x.Description,BarcodeType=x.BarcodeType,PackageCode=x.PackageCode}).ToList();
        if(change!.Mode!="none") requests.Insert(0,new(){Id=primary?.Id,IsPrimary=true,Change=change,BarcodeType=type,PackageCode=primary?.PackageCode??"EA"});
        await SaveBarcodes(p,requests.ToArray(),Guid.Empty,ct);
    }
    async Task<Product> Find(Guid tenant,Guid id,CancellationToken ct)=>await db.Products.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id,ct)??throw Error(404,"상품을 찾을 수 없습니다.");
    static string Text(string raw,int max,string label)
    {
        var value=raw.Trim().Normalize(NormalizationForm.FormKC);
        if(value.Length<1||value.Length>max||value.Any(char.IsControl)) throw Error(400,$"{label}은(는) 1~{max}자로 입력해 주세요.");
        return value;
    }
    static void CheckVersion(Product p,Guid version) {if(version==Guid.Empty||p.Version!=version) throw Error(409,"다른 사용자가 상품을 변경했습니다. 상세 정보를 다시 열어 확인해 주세요.");}
    async Task<IDbContextTransaction> Begin(Guid tenant,CancellationToken ct)
    {
        var tx=await db.Database.BeginTransactionAsync(ct);
        try {await ProductUsagePolicy.SerializeWrites(db,tenant,ct);return tx;}catch{await tx.DisposeAsync();throw;}
    }
    async Task Save(CancellationToken ct)
    {
        try {await db.SaveChangesAsync(ct);}
        catch(DbUpdateConcurrencyException){throw Error(409,"다른 사용자가 상품을 변경했습니다. 상세 정보를 다시 열어 주세요.");}
        catch(DbUpdateException){throw Error(409,"상품코드·바코드 중복 또는 참조 데이터 변경으로 저장하지 못했습니다. 입력 내용을 확인해 주세요.");}
    }
    static JsonElement Snapshot(Product p)=>JsonSerializer.SerializeToElement(new{p.Code,p.Name,p.CategoryId,p.ProductTypeId,p.ModelNumber,p.Origin,p.CostPrice,p.RetailPrice,p.Currency,p.WeightGrams,p.WidthCm,p.DepthCm,p.HeightCm,p.BoxWeightGrams,p.BoxWidthCm,p.BoxDepthCm,p.BoxHeightCm,p.InnerPackQuantity,p.OuterPackQuantity,p.OuterPackUnit,p.PalletPackQuantity,p.HasImage,p.Unit,p.Barcode,p.BarcodeType,p.BarcodeIsGenerated,p.LotManaged,p.ExpiryManaged,p.SerialManaged,p.SafetyStock,p.IsActive,p.Notes,p.TrackingLockedAt});
    void Audit(Guid tenant,Guid actor,Guid target,string action,object before,object after)=>db.ProductChanges.Add(new(){TenantId=tenant,TargetId=target,ChangedByUserId=actor,ChangedAt=clock.GetUtcNow(),Action=action,BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(after)});
    static OrganizationException Error(int status,string message)=>new(status,message);
}
