using System.Security.Claims;
using IebleWms.Api.Auth;
using IebleWms.Api.Data;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[ApiController, ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class WorkspaceController(WmsDbContext db, MembershipAccessService access, IebleWms.Api.Billing.BillingAccessService billing, IebleWms.Api.Permissions.TenantPermissionService permissions) : ControllerBase
{
    [HttpGet("api/admin/overview"), Authorize(Policy = "IebleAdministrator")]
    public async Task<IActionResult> Admin(CancellationToken token) => Ok(new
    {
        tenantCount = await db.Tenants.CountAsync(token), userCount = await db.Users.CountAsync(token),
        billingPendingCount = await db.Tenants.CountAsync(x => x.BillingStatus != Models.TenantBillingStatus.Paid, token)
    });

    [HttpGet("api/tenants/{tenantId:guid}/workspace"), Authorize(Policy = "TenantMember")]
    public async Task<IActionResult> Workspace(Guid tenantId, CancellationToken token)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
        var role = await access.GetTenantRoleAsync(Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), tenantId, token);
        var latestChange = await db.TenantStatusChanges.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.ChangedAt).ThenByDescending(x => x.Id).Select(x => new { x.Reason, x.ChangedAt }).FirstOrDefaultAsync(token);
        return Ok(new { latestChange, tenant.Id, tenant.Name, tenant.BusinessRegistrationNumber,
            billingStatus = tenant.BillingStatus.ToString(), billingAccess = billing.Evaluate(tenant), billingPolicy = billing.Policy, billingProvider = "TossPayments", billingProviderConfigured = false,
            canManageBilling = role == Models.TenantRole.Master,
            permissions = await permissions.EffectiveAsync(tenantId, role, token),
            role = role.ToString(), serviceStatus = tenant.ServiceStatus.ToString() });
    }
    [HttpGet("api/tenants/{tenantId:guid}/dashboard"), Authorize(Policy = "Permission:dashboard:read")]
    public async Task<IActionResult> Dashboard(Guid tenantId, CancellationToken token)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
        return Ok(new { tenantId, name = tenant.Name, message = "WMS 업무 공간을 이용할 수 있습니다." });
    }
}
