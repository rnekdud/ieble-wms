using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Warehousing;

// Candidates are not reservations or DB writes. Final saves still enforce uniqueness in the DB.
public sealed class RackBarcodeCandidates(IebleWms.Api.Barcodes.InternalBarcodeCandidates candidates)
{
    internal static async Task<string> NewValue(WmsDbContext db, CancellationToken ct)
    {
        string value;
        do { value = await IebleWms.Api.Barcodes.InternalBarcodeRule.NewValue(db, ct); }
        while (await db.StorageBarcodes.AnyAsync(x => x.Value == value, ct));
        return value;
    }
    public Task<RackBarcodeCandidate> Generate(WmsDbContext db, Guid tenant, CancellationToken ct) =>
        candidates.Generate(db,tenant, "rack", value => db.StorageBarcodes.AnyAsync(x => x.Value == value, ct));
    internal void Verify(Guid tenant, string value, string? proof) => candidates.Verify(tenant, "rack", value, proof);
}
