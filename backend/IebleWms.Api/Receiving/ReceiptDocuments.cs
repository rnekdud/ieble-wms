using IebleWms.Api.Models;
namespace IebleWms.Api.Receiving;
public sealed partial class ReceiptService
{
    // Reuse the detail reader, including its persisted line order and tenant checks. No SaveChanges.
    internal async Task<(InboundReceipt Receipt, List<InboundReceiptLine> Lines)> DocumentSource(Guid tenant, Guid id, CancellationToken ct)
        => (await Find(tenant, id, ct), await Lines(tenant, id, ct));
}
