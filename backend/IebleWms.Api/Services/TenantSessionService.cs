using System.Security.Claims;
using IebleWms.Api.Auth;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Services;

public sealed class TenantSessionService(WmsDbContext db, SignInManager<ApplicationUser> signIn)
{
    public async Task<Guid?> ResolveAsync(Guid userId, CancellationToken token = default)
    {
        var memberships = await db.TenantMemberships.AsNoTracking().Where(x => x.UserId == userId && x.IsActive && x.User.IsActive && x.Tenant.IsActive)
            .Select(x => new { x.TenantId, x.IsDefault }).ToListAsync(token);
        return memberships.Count == 1 ? memberships[0].TenantId : memberships.SingleOrDefault(x => x.IsDefault)?.TenantId;
    }
    public Task IssueAsync(ApplicationUser user, Guid? tenantId, AuthenticationProperties properties) =>
        signIn.SignInWithClaimsAsync(user, properties, tenantId is Guid id ? new[] { new Claim(AuthConfiguration.TenantClaim, id.ToString()) } : Array.Empty<Claim>());
}
