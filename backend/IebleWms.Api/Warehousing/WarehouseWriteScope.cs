using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace IebleWms.Api.Warehousing;

// Individual APIs own their transaction; aggregate saves lend the same transaction to them.
internal sealed class WarehouseWriteScope(IDbContextTransaction? owned) : IAsyncDisposable
{
    public static async Task<WarehouseWriteScope> Begin(WmsDbContext db, Guid tenantId, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction != null) return new(null);
        var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            if (db.Database.IsNpgsql())
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"warehouse:" + tenantId}, 0))", ct);
            return new(transaction);
        }
        catch { await transaction.DisposeAsync(); throw; }
    }
    public Task CommitAsync(CancellationToken ct) => owned?.CommitAsync(ct) ?? Task.CompletedTask;
    public ValueTask DisposeAsync() => owned?.DisposeAsync() ?? ValueTask.CompletedTask;
}
