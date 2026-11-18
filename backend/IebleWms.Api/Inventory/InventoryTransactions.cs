using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
namespace IebleWms.Api.Inventory;
// Retain the shipping lock key for compatibility with existing outbound writers.
// Acquire this before the product-policy lock in every inventory workflow.
public static class InventoryTransactions
{
    public static async Task<IDbContextTransaction> Begin(WmsDbContext db, Guid tenant, CancellationToken ct)
    {
        var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            if (db.Database.IsNpgsql())
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"shipping:" + tenant},0))", ct);
            return tx;
        }
        catch { await tx.DisposeAsync(); throw; }
    }
}
