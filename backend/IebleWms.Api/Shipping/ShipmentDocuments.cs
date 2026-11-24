using IebleWms.Api.Models;
namespace IebleWms.Api.Shipping;
public sealed partial class ShipmentService
{
    internal async Task<(OutboundShipment Shipment, List<OutboundShipmentLine> Lines, List<ShipmentAllocation> Allocations)> DocumentSource(Guid tenant, Guid id, CancellationToken ct)
    {
        var shipment = await Find(tenant, id, ct);
        var lines = await Lines(tenant, id, ct);
        return (shipment, lines, await Allocations(tenant, lines, ct));
    }
}
