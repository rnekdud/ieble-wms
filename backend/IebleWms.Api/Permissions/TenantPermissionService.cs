using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Permissions;

public sealed class TenantPermissionService(WmsDbContext db, Services.MembershipAccessService membership, Billing.BillingAccessService billing, Warehousing.WarehouseSetupAccess warehouseSetup)
{
    public async Task<Dictionary<string, Dictionary<string, string[]>>> ReadAsync(Guid tenantId, CancellationToken token = default)
    {
        var json = await db.TenantPermissionSettings.AsNoTracking().Where(x => x.TenantId == tenantId).Select(x => x.RolesJson).SingleOrDefaultAsync(token);
        var result = json is null ? PermissionCatalog.Defaults() : JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(json)!;
        // Existing saved grants remain unchanged; new features require an explicit master grant.
        foreach (var role in PermissionCatalog.EditableRoles)
            foreach (var feature in PermissionCatalog.Features)
            {
                result[role].TryAdd(feature.Key, []);
                result[role][feature.Key] = result[role][feature.Key].Intersect(PermissionCatalog.ActionsForRole(feature, role)).ToArray();
            }
        return result;
    }

    public async Task<Dictionary<string, string[]>> EffectiveAsync(Guid tenantId, TenantRole? role, CancellationToken token = default) => role switch
    {
        TenantRole.Master => PermissionCatalog.Features.ToDictionary(f => f.Key, f => f.Actions.ToArray()),
        TenantRole.Administrator or TenantRole.Employee => (await ReadAsync(tenantId, token))[role.ToString()!],
        _ => []
    };

    // No cookie claims/cache: role and grants are checked against the database on every request.
    public async Task<bool> AllowsAsync(Guid userId, Guid tenantId, string featureKey, string action, CancellationToken token = default)
    {
        var feature = PermissionCatalog.Features.SingleOrDefault(f => f.Key == featureKey);
        if (feature is null || !feature.Actions.Contains(action)) return false;
        var role = await membership.GetTenantRoleAsync(userId, tenantId, token);
        var permissions = await EffectiveAsync(tenantId, role, token);
        if (!permissions.TryGetValue(featureKey, out var actions) || !actions.Contains("menu") || !actions.Contains("read") || !actions.Contains(action)) return false;
        if (featureKey == "users" && action is not ("menu" or "read") && !actions.Contains("manageUsers")) return false;
        if (feature.Business)
        {
            var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
            // Preserve the billing gate; only explicitly enabled development warehouse setup may bypass missing-card status.
            return billing.Evaluate(tenant).CanAccessWms || (featureKey == "warehouses" && warehouseSetup.AllowsWithoutCard(tenant));
        }
        return true;
    }
}
