using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;

public static class ProductPackaging
{
    public static readonly string[] Codes = ["EA", "INNER", "OUTER", "PALLET"];
    public static decimal Factor(Product p, string package)
    {
        if (!Codes.Contains(package)) throw new OrganizationException(400,"포장 단위를 확인해 주세요.");
        if (package == "EA") return 1;
        if (p.Unit != "EA") throw new OrganizationException(409,"기존 비EA 상품은 환산 기준 확인 후 이관해야 포장 바코드를 사용할 수 있습니다.");
        decimal inner = p.InnerPackQuantity ?? 0;
        decimal outer = (p.OuterPackQuantity ?? 0) * (p.OuterPackUnit == "EA" ? 1 : inner);
        decimal factor = package == "INNER" ? inner : package == "OUTER" ? outer : outer * (p.PalletPackQuantity ?? 0);
        if (factor < 1 || factor > 999999999) throw new OrganizationException(400,"포장 수량과 상위 포장 연결을 확인해 주세요. 환산 수량은 1~999,999,999개입니다.");
        return factor;
    }
    public static void Validate(Product p)
    {
        if (p.OuterPackUnit is not ("EA" or "INNER")) throw new OrganizationException(400,"아웃박스 구성은 낱개 또는 인박스입니다.");
        if (new[]{p.InnerPackQuantity,p.OuterPackQuantity,p.PalletPackQuantity}.Any(x=>x is <=0)) throw new OrganizationException(400,"포장 수량은 1 이상의 정수입니다.");
        if(p.InnerPackQuantity.HasValue)Factor(p,"INNER");
        if(p.OuterPackQuantity.HasValue)Factor(p,"OUTER");
        if(p.PalletPackQuantity.HasValue)Factor(p,"PALLET");
    }
    public static void ValidateEach(decimal quantity,string unit)
    {
        if(unit=="EA" && decimal.Truncate(quantity)!=quantity)throw new OrganizationException(400,"개(EA) 수량은 정수로 입력해 주세요.");
    }
    public sealed record ScanPackage(Guid Id,string Value,string Package,decimal Quantity);
    public static async Task<string> Capture(WmsDbContext db,Guid tenant,Product product,CancellationToken ct)
    {
        var labels=await db.StorageBarcodes.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ProductId==product.Id).ToListAsync(ct);
        return JsonSerializer.Serialize(labels.Select(x=>new ScanPackage(x.Id,x.Value,x.PackageCode,Factor(product,x.PackageCode))));
    }
    public static decimal ScanFactor(string snapshot,StorageBarcode label,string unit)
    {
        var row=JsonSerializer.Deserialize<ScanPackage[]>(snapshot)!.SingleOrDefault(x=>x.Id==label.Id&&x.Value==label.Value)
            ?? throw new OrganizationException(409,"문서 저장 이후 추가·변경된 바코드입니다. 문서에 보존된 바코드 또는 직접 수량 입력을 사용해 주세요.");
        return unit=="EA"?row.Quantity:1;
    }
}
