using IebleWms.Api.Billing;
using IebleWms.Api.Models;

namespace IebleWms.Api.Warehousing;

// Explicit local-development exception for warehouse setup only. Never grants
// membership/action permissions and never changes card/payment entitlement.
public sealed class WarehouseSetupAccess(IHostEnvironment environment, IConfiguration configuration, BillingAccessService billing)
{
    public bool AllowsWithoutCard(Tenant tenant) => environment.IsDevelopment()
        && tenant.BillingPolicyVersion == 1
        && configuration.GetValue<bool>("DevelopmentFeatures:AllowWarehouseSetupWithoutCard")
        && billing.Evaluate(tenant).State == "CardRequired";
}
