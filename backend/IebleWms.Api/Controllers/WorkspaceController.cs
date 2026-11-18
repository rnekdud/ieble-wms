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
    public async Task<IActionResult> Admin(CancellationToken token)
    {
        var since = HttpContext.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow().AddDays(-30);
        return Ok(new
        {
        tenantCount = await db.Tenants.CountAsync(token), userCount = await db.Users.CountAsync(token),
        billingPendingCount = await db.Tenants.CountAsync(x => x.BillingStatus != Models.TenantBillingStatus.Paid, token),
        activeTenantCount=await db.Tenants.CountAsync(x=>x.IsActive && x.ServiceStatus==Models.TenantServiceStatus.Active,token),
        activeUserCount=await db.Users.CountAsync(x=>x.IsActive,token),
        newTenantCount=await db.Tenants.CountAsync(x=>x.CreatedAt>=since,token),
        inquiryCount=await db.BillingFeedbacks.CountAsync(token),
        pendingInquiryCount=await db.BillingFeedbacks.CountAsync(x=>x.Status=="Received"||x.Status=="InProgress",token)
        });
    }

    [HttpGet("api/tenants/{tenantId:guid}/workspace"), Authorize(Policy = "TenantMember")]
    public async Task<IActionResult> Workspace(Guid tenantId, CancellationToken token)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
        var role = await access.GetTenantRoleAsync(Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), tenantId, token);
        var accountType = await db.TenantMemberships.Where(x => x.TenantId == tenantId && x.UserId == Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!)).Select(x => x.AccountType).SingleAsync(token);
        var latestChange = await db.TenantStatusChanges.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.ChangedAt).ThenByDescending(x => x.Id).Select(x => new { x.Reason, x.ChangedAt }).FirstOrDefaultAsync(token);
        return Ok(new { currentAssignee = await IebleWms.Api.Organization.BusinessAssignees.Current(db, tenantId, Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), token), logoVersion = accountType == "Internal" ? tenant.LogoVersion : null, accountType, latestChange, tenant.Id, tenant.Name, tenant.BusinessRegistrationNumber,
            tenant.BillingPolicyVersion, tenant.BillingAnchorDay, tenant.AutoBillingCanceledAt, tenant.ServiceEndsAt,
            billingStatus = tenant.BillingStatus.ToString(), billingAccess = await billing.EvaluateWorkspace(tenant, token), billingPolicy = billing.Policy, billingProvider = "TossPayments", billingProviderConfigured = false,
            canManageBilling = role == Models.TenantRole.Master,
            warehouseSetupPreview = false, // Legacy field; unscoped warehouse preview is retired.
            permissions = await permissions.EffectiveForUserAsync(tenantId, Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), token),
            role = role.ToString(), serviceStatus = tenant.ServiceStatus.ToString() });
    }
}
