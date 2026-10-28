using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Services;

// Call only with a server-verified user ID when authentication endpoints are implemented.
public sealed class MembershipAccessService(WmsDbContext db)
{
    public Task<bool> IsIebleAdministratorAsync(Guid userId, CancellationToken cancellationToken = default) =>
        db.Users.AsNoTracking().AnyAsync(x => x.Id == userId && x.IsActive &&
            x.SystemRole == SystemRole.IebleAdministrator, cancellationToken);

    // Platform administrators get no implicit tenant membership or tenant business authority.
    public Task<TenantRole?> GetTenantRoleAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default) =>
        db.TenantMemberships.AsNoTracking()
            .Where(x => x.UserId == userId && x.TenantId == tenantId &&
                x.IsActive && x.User.IsActive && x.Tenant.IsActive)
            .Select(x => (TenantRole?)x.Role)
            .SingleOrDefaultAsync(cancellationToken);
}
