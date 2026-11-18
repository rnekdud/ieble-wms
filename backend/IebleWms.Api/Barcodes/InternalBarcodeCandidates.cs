using System.Security.Cryptography;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using IebleWms.Api.Contracts;
using IebleWms.Api.Organization;
using Microsoft.AspNetCore.DataProtection;
namespace IebleWms.Api.Barcodes;

// Twenty digits deliberately differ from GTIN-8/12/13/14. CODE128, never EAN or GS1-128.
public static class InternalBarcodeRule
{
    private static long testSequence=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()*1000;
    public static async Task<string> NewValue(WmsDbContext db,CancellationToken ct=default)
    {
        var number=db.Database.IsNpgsql()
            ? await db.Database.SqlQueryRaw<long>("SELECT nextval('\"InternalBarcodeNumbers\"') AS \"Value\"").SingleAsync(ct)
            : Interlocked.Increment(ref testSequence);
        return "880"+number.ToString("D17",System.Globalization.CultureInfo.InvariantCulture);
    }
}
public sealed class InternalBarcodeCandidates(IDataProtectionProvider protection)
{
    public async Task<RackBarcodeCandidate> Generate(WmsDbContext db,Guid tenant, string kind, Func<string,Task<bool>> exists)
    {
        string value; do { value=await InternalBarcodeRule.NewValue(db); } while(await exists(value));
        return new(value,Protector(kind).Protect($"{tenant:N}:{value}"));
    }
    IDataProtector Protector(string kind)=>protection.CreateProtector($"ieble.{kind}-barcode-candidate.v1");
    public void Verify(Guid tenant,string kind,string value,string? proof)
    {
        try { if(!string.IsNullOrEmpty(proof)&&Protector(kind).Unprotect(proof)==$"{tenant:N}:{value}") return; }
        catch(CryptographicException) { }
        throw new OrganizationException(400,"자동 생성값을 확인할 수 없습니다. 다시 생성하거나 직접 입력해 주세요.");
    }
}
