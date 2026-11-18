using IebleWms.Api.Models;
namespace IebleWms.Api.Warehousing;

// Compatibility shim: the former global development flag no longer grants access.
// All business access now uses BillingAccessService.EvaluateWorkspace and a per-tenant timed grant.
public sealed class WarehouseSetupAccess
{
    public bool AllowsWithoutCard(Tenant tenant) => false;
}
