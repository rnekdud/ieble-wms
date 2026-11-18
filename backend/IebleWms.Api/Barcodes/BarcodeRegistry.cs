using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Barcodes;
internal static class BarcodeRegistry
{
    public static Task<StorageBarcode?> Find(WmsDbContext db,Guid tenant,string value,CancellationToken ct)
    {
        BarcodeChangePolicy.Validate(new RackBarcodeChange{Mode="manual",Value=value},"상품 바코드");
        return db.StorageBarcodes.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Value==value,ct);
    }
}
