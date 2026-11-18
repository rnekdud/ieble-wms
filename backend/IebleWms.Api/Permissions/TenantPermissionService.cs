using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Permissions;

public sealed class TenantPermissionService(WmsDbContext db, Billing.BillingAccessService billing)
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
        var customIds = await db.PermissionGrades.Where(x => x.TenantId == tenantId && x.SystemRole == null).Select(x => x.Id).ToListAsync(token);
        var keys = PermissionCatalog.EditableRoles.Concat(customIds.Select(x => x.ToString())).ToHashSet();
        foreach (var key in result.Keys.Where(x => !keys.Contains(x)).ToArray()) result.Remove(key);
        foreach (var id in customIds) {
            var key = id.ToString();
            result.TryAdd(key, PermissionCatalog.Features.ToDictionary(f => f.Key, _ => Array.Empty<string>()));
            foreach (var feature in PermissionCatalog.Features) {
                result[key].TryAdd(feature.Key, []);
                result[key][feature.Key] = result[key][feature.Key].Intersect(PermissionCatalog.ImplementedActions(feature)).ToArray();
            }
        }
        return result;
    }

    public async Task<Dictionary<string, string[]>> EffectiveAsync(Guid tenantId, TenantRole? role, CancellationToken token = default) => role switch
    {
        TenantRole.Master => PermissionCatalog.Features.ToDictionary(f => f.Key, f => f.Actions.ToArray()),
        TenantRole.Administrator or TenantRole.Employee => (await ReadAsync(tenantId, token))[role.ToString()!],
        _ => []
    };

    public async Task<Dictionary<string, string[]>> EffectiveForUserAsync(Guid tenantId, Guid userId, CancellationToken token = default)
    {
        var member = await CollaboratorAccess.Memberships(db).AsNoTracking().Include(x => x.Collaborator).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, token);
        if (member == null) return [];
        if (member.AccountType == "External") return CollaboratorAccess.Effective(member.Collaborator!, member);
        if (member.Role == TenantRole.Master) return await EffectiveAsync(tenantId, member.Role, token);
        if (member.PermissionGradeId is { } id) {
            if (!await db.PermissionGrades.AnyAsync(x => x.TenantId == tenantId && x.Id == id && x.SystemRole == null && x.IsActive, token)) return [];
            return (await ReadAsync(tenantId, token)).GetValueOrDefault(id.ToString()) ?? [];
        }
        if (await db.PermissionGrades.AnyAsync(x => x.TenantId == tenantId && x.SystemRole == member.Role.ToString() && !x.IsActive, token)) return [];
        return await EffectiveAsync(tenantId, member.Role, token);
    }

    // No cookie claims/cache: role and grants are checked against the database on every request.
    public async Task<bool> AllowsAsync(Guid userId, Guid tenantId, string featureKey, string action, CancellationToken token = default)
    {
        var feature = PermissionCatalog.Features.SingleOrDefault(f => f.Key == featureKey);
        if (feature is null || !feature.Actions.Contains(action)) return false;
        var permissions = await EffectiveForUserAsync(tenantId, userId, token);
        if (!permissions.TryGetValue(featureKey, out var actions) || !actions.Contains("menu") || !actions.Contains("read") || !actions.Contains(action)) return false;
        if (featureKey == "users" && action is not ("menu" or "read") && !actions.Contains("manageUsers")) return false;
        if (feature.Business)
        {
            var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
            // Payment and tenant-scoped local development access remain server-side; action permissions above are mandatory.
            return (await billing.EvaluateWorkspace(tenant, token)).CanAccessWms;
        }
        return true;
    }
}
