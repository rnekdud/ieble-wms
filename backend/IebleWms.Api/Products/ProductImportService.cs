using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;
public sealed class ProductImportRequest {
    public Guid RequestId {get;set;}
    [System.ComponentModel.DataAnnotations.StringLength(7000000)] public string FileBase64 {get;set;}="";
}
public sealed partial class ProductService
{
    async Task<List<ProductType>> ImportTypes(Guid tenant,CancellationToken ct)
    {
        var own=await db.ProductTypes.AsNoTracking().Where(x=>x.TenantId==tenant).ToListAsync(ct);
        return DefaultProductClassification.TypeRows(tenant).Where(x=>!own.Any(c=>c.Id==x.Id)).Concat(own).ToList();
    }
    public async Task<byte[]> ImportTemplate(Guid tenant,CancellationToken ct)=>await ProductImportWorkbook.Template(await CategoryOptions(tenant,ct),await ImportTypes(tenant,ct),ct);

    public async Task<object> ImportProducts(Guid tenant,Guid actor,ProductImportRequest request,bool commit,CancellationToken ct)
    {
        if(request.RequestId==Guid.Empty)throw Error(400,"등록 요청 번호가 필요합니다.");
        await using var tx=await Begin(tenant,ct);
        var errors=new List<ProductImportError>();
        var input=ProductImportWorkbook.Read(request.FileBase64,errors);
        var categories=await CategoryOptions(tenant,ct);
        var types=await ImportTypes(tenant,ct);
        var existing=await db.Products.AsNoTracking().Where(x=>x.TenantId==tenant).Select(x=>new{x.NormalizedCode,x.CreationRequestId}).ToListAsync(ct);
        var barcodes=await db.StorageBarcodes.AsNoTracking().Where(x=>x.TenantId==tenant||x.IsGenerated).Select(x=>new{x.Value,x.ProductId}).ToListAsync(ct);
        var replays=await db.Products.AsNoTracking().Where(x=>x.TenantId==tenant).Select(x=>new{x.Id,x.CreationRequestId}).ToListAsync(ct);
        var requests=new List<(int Row,ProductRequest Product)>();var seenCodes=new HashSet<string>();var seenLabels=new HashSet<string>();
        foreach(var (row,v) in input) {
            void ErrorAt(int col,string message)=>errors.Add(new(row,ProductImportWorkbook.Headers[col],v[col],message));
            decimal? Number(int col,bool integer=false,decimal max=999999999999.99m,bool zeroAllowed=false)
            {
                if(v[col]=="")return null;
                var raw=v[col];
                var format=System.Text.RegularExpressions.Regex.IsMatch(raw,@"^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?$");
                if(!format||!decimal.TryParse(raw,NumberStyles.AllowDecimalPoint|NumberStyles.AllowThousands,CultureInfo.InvariantCulture,out var n)||n<0||n>max||(integer?((!zeroAllowed&&n<1)||n!=decimal.Truncate(n)):n!=decimal.Round(n,2))) {
                    ErrorAt(col,integer?(zeroAllowed?"0 이상 999,999,999 이하의 정수를 입력해 주세요.":"1 이상의 정수를 입력해 주세요. (최대 999,999,999)"):"0 이상, 소수점 2자리 이내의 숫자를 입력해 주세요. (최대 999,999,999,999.99)");return null;
                }
                return n;
            }
            var id=new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{request.RequestId:N}:{row}"))[..16]);
            var p=new ProductRequest{RequestId=id,Name=v[0],Code=v[1],Unit="EA",ModelNumber=v[6],Origin=v[7],RetailPrice=Number(8),CostPrice=Number(9),SafetyStock=Number(10,true,999999999,true),InnerPackQuantity=(int?)Number(11,true,999999999),OuterPackQuantity=(int?)Number(12,true,999999999),OuterPackUnit=v[13] is "" or "인박스"?"INNER":v[13]=="낱개"?"EA":v[13],PalletPackQuantity=(int?)Number(14,true,999999999),Notes=v[19],Barcodes=[]};
            foreach(var (col,max,required) in new[]{(0,200,true),(1,64,false),(6,100,false),(7,100,false),(19,2000,false)})if((required&&v[col].Length==0)||v[col].Normalize(NormalizationForm.FormKC).Length>max||(col!=19&&v[col].Any(char.IsControl)))ErrorAt(col,required&&v[col].Length==0?"상품명을 입력해 주세요.":$"제어문자 없이 {max}자 이내로 입력해 주세요.");
            if(p.Code.Length>0){var code=p.Code.Normalize(NormalizationForm.FormKC).ToUpperInvariant();if(!seenCodes.Add(code)||existing.Any(x=>x.NormalizedCode==code&&x.CreationRequestId!=id))ErrorAt(1,"이미 사용 중이거나 파일 내 중복된 상품코드입니다.");}
            if(v[2]!=""){var choices=types.Where(x=>x.Name==v[2]&&x.IsActive).ToArray();if(choices.Length!=1)ErrorAt(2,"사용 가능한 상품 구분명을 확인해 주세요.");else p.ProductTypeId=choices[0].Id;}
            Guid? parent=null;var validParent=true;
            for(var col=3;col<=5;col++) {
                if(v[col]=="") { validParent=false;continue; }
                if(col>3 && v[col-1]=="") { ErrorAt(col,$"{col-3}차 카테고리를 먼저 선택해 주세요.");validParent=false;continue; }
                if(!validParent) { ErrorAt(col,"상위 카테고리 오류를 먼저 수정해 주세요.");continue; }
                var siblings=categories.Where(x=>x.ParentId==parent&&string.Equals(x.Name,v[col],StringComparison.OrdinalIgnoreCase)).ToArray();
                var active=siblings.Where(x=>x.IsActive).ToArray();
                if(active.Length>1) { ErrorAt(col,"같은 상위 분류에 동일한 이름의 카테고리가 여러 개입니다. 분류 관리에서 이름을 구분해 주세요.");validParent=false;continue; }
                var choice=active.SingleOrDefault(x=>x.Name==v[col]);
                if(choice==null) {
                    ErrorAt(col,siblings.Any(x=>x.Name==v[col]&&!x.IsActive)?$"사용 중지된 {col-2}차 카테고리입니다. 현재 사용 가능한 항목을 선택해 주세요.":col==3?"현재 기업에서 사용 가능한 1차 카테고리가 아닙니다.":$"선택한 {col-3}차 카테고리의 하위 분류가 아닙니다. 현재 사용 가능한 항목을 선택해 주세요.");
                    validParent=false;continue;
                }
                parent=choice.Id;p.CategoryId=parent;
            }
            var model=new Product{Unit="EA",InnerPackQuantity=p.InnerPackQuantity,OuterPackQuantity=p.OuterPackQuantity,OuterPackUnit=p.OuterPackUnit,PalletPackQuantity=p.PalletPackQuantity};
            if(model.OuterPackUnit is not ("INNER" or "EA"))ErrorAt(13,"인박스 또는 낱개를 입력해 주세요.");
            else {
                foreach(var (quantity,package,col) in new[]{(model.InnerPackQuantity,"INNER",11),(model.OuterPackQuantity,"OUTER",12),(model.PalletPackQuantity,"PALLET",14)})
                    if(quantity.HasValue)try{ProductPackaging.Factor(model,package);}catch(OrganizationException e){ErrorAt(col,e.Message);}
            }
            var labels=new List<ProductBarcodeRequest>();
            for(var col=15;col<=18;col++)if(v[col]!="") {
                var label=new ProductBarcodeRequest{Change=new(){Mode="manual",Value=v[col]},PackageCode=ProductPackaging.Codes[col-15],IsPrimary=labels.Count==0,BarcodeType="External"};
                try{BarcodeChangePolicy.Validate(label.Change,"바코드");ProductPackaging.Factor(model,label.PackageCode);}catch(OrganizationException e){ErrorAt(col,e.Message);}
                var own=replays.FirstOrDefault(x=>x.CreationRequestId==id)?.Id;
                if(!seenLabels.Add(v[col])||barcodes.Any(x=>x.Value==v[col]&&(!own.HasValue||x.ProductId!=own)))ErrorAt(col,"이미 등록된 상품·랙·위치 바코드이거나 파일 내 중복입니다.");
                labels.Add(label);
            }
            p.Barcodes=labels.ToArray();requests.Add((row,p));
        }
        if(commit&&errors.Count==0) {
            // Reserve explicit codes first so generated PR codes cannot collide with a later row.
            foreach(var item in requests.OrderBy(x=>string.IsNullOrWhiteSpace(x.Product.Code)))
            {
                try { await SaveProduct(tenant,actor,null,item.Product,ct); }
                catch(OrganizationException e) { errors.Add(new(item.Row,"상품 등록","",e.Message)); break; }
            }
            if(errors.Count==0)await tx.CommitAsync(ct);
        }
        errors=errors.Select(e=>{
            var source=input.FirstOrDefault(x=>x.Row==e.Row).Values;
            return e with { ProductName=source?[0],ProductCode=source?[1] };
        }).ToList();
        var invalid=errors.Any(x=>x.Row<=1)?requests.Count:requests.Count(x=>errors.Any(e=>e.Row==x.Row));
        return new{valid=requests.Count-invalid,invalid,committed=commit&&errors.Count==0,errors,total=requests.Count,rows=requests.Select(x=>new{x.Row,x.Product.Name,x.Product.Code,x.Product.InnerPackQuantity,x.Product.OuterPackQuantity,x.Product.OuterPackUnit,x.Product.PalletPackQuantity})};
    }
}
