using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;

// First inventory/receipt/shipment writer calls this in the SAME transaction as its real business history.
// A rollback rolls back this lock as well. There is deliberately no client-facing lock/unlock API.
public sealed class ProductUsagePolicy(WmsDbContext db,TimeProvider clock)
{
    public static Task SerializeWrites(WmsDbContext db,Guid tenant,CancellationToken ct)=>db.Database.IsNpgsql()
        ? db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"product:"+tenant},0))",ct) : Task.CompletedTask;
    public async Task<Product> LockForInventory(Guid tenant,Guid productId,CancellationToken ct=default)
    {
        if(db.Database.CurrentTransaction==null) throw new InvalidOperationException("Product policy and business history must share a transaction.");
        await SerializeWrites(db,tenant,ct);
        var product=await db.Products.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==productId,ct) ?? throw new OrganizationException(404,"상품을 찾을 수 없습니다.");
        if(!product.IsActive) throw new OrganizationException(409,"사용 중지된 상품에는 새 입출고를 등록할 수 없습니다.");
        if(product.TrackingLockedAt==null) { product.TrackingLockedAt=clock.GetUtcNow();await db.SaveChangesAsync(ct); }
        return product;
    }
}
