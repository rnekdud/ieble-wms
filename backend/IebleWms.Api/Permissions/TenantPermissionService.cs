using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Permissions;

public sealed class TenantPermissionService(WmsDbContext db, Services.MembershipAccessService membership, Billing.BillingAccessService billing)
{
    public async Task<Dictionary<string, Dictionary<string, string[]>>> ReadAsync(Guid tenantId, CancellationToken token = default)
    {
        var json = await db.TenantPermissionSettings.AsNoTracking().Where(x => x.TenantId == tenantId).Select(x => x.RolesJson).SingleOrDefaultAsync(token);
        return json is null ? PermissionCatalog.Defaults() : JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(json)!;
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
            // Same gate as the existing ActiveTenant policy, including suspension/card/free-month rules.
            return billing.Evaluate(tenant).CanAccessWms;
        }
        return true;
    }
}
