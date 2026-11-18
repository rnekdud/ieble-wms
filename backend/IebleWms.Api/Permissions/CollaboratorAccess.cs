using IebleWms.Api.Data;
using IebleWms.Api.Models;

namespace IebleWms.Api.Permissions;
public static class CollaboratorAccess
{
    public static IQueryable<TenantMembership> Memberships(WmsDbContext db) => db.TenantMemberships.Where(x =>
        x.IsActive && x.User.IsActive && x.Tenant.IsActive && (x.AccountType == "Internal" ||
        (x.Collaborator != null && x.Collaborator.IsActive && (x.Collaborator.PartnerId == null || x.Collaborator.Partner!.IsActive))));

    public static Dictionary<string, string[]> Effective(ExternalCollaborator collaborator, TenantMembership member)
    {
        var ceiling = ExternalPermissionPolicy.Read(collaborator.PermissionsJson);
        if (!member.UseIndividualPermissions) return ceiling;
        var individual = ExternalPermissionPolicy.Read(member.ExternalPermissionsJson);
        return ceiling.ToDictionary(k => k.Key, k => k.Value.Intersect(individual[k.Key]).ToArray());
    }
}
