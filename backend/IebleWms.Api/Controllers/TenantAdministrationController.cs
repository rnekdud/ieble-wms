using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using IebleWms.Api.Administration;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/admin/tenants"), Authorize(Policy = "IebleAdministrator")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class TenantAdministrationController(WmsDbContext db, TenantAdministrationService administration, IebleWms.Api.Billing.BillingAccessService billing) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, StringLength(100)] string? search, [FromQuery] string? status,
        [FromQuery] DateOnly? start, [FromQuery] DateOnly? end, [FromQuery] string? billingStatus,
        [FromQuery, Range(1, 100000)] int page = 1, [FromQuery, Range(1, 100)] int pageSize = 20, CancellationToken token = default)
    {
        var query = db.Tenants.AsNoTracking();
        if (!string.IsNullOrEmpty(status))
        {
            if (!Enum.TryParse<TenantServiceStatus>(status, out var parsed) || !Enum.IsDefined(parsed)) return BadRequest(new { message = "지원하지 않는 기업 상태입니다." });
            query = query.Where(x => x.ServiceStatus == parsed);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToUpperInvariant(); var number = term.Replace("-", "");
            query = query.Where(x => x.Name.ToUpper().Contains(term) || (x.BusinessRegistrationNumber != null && x.BusinessRegistrationNumber.Contains(number)));
        }
        if (!Support.SupportService.ValidPeriod(start, end)) return BadRequest(new { message = "가입 기간을 확인해 주세요." });
        if (start.HasValue) { var from = Support.SupportService.Boundary(start.Value).ToUniversalTime(); query = query.Where(x => x.CreatedAt >= from); }
        if (end.HasValue) { var until = Support.SupportService.Boundary(end.Value.AddDays(1)).ToUniversalTime(); query = query.Where(x => x.CreatedAt < until); }
        if (!string.IsNullOrEmpty(billingStatus)) {
            if (!Enum.TryParse<TenantBillingStatus>(billingStatus, out var parsedBilling) || !Enum.IsDefined(parsedBilling)) return BadRequest(new { message = "결제 상태를 확인해 주세요." });
            query = query.Where(x => x.BillingStatus == parsedBilling);
        }
        var total = await query.CountAsync(token);
        page = Math.Min(page, Math.Max(1, (total + pageSize - 1) / pageSize));
        var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { billingTenant = x, x.Id, x.Name, x.BusinessRegistrationNumber, x.CreatedAt, x.Version, x.IsActive,
                userCount = x.Memberships.Count(m => m.IsActive && m.User.IsActive), serviceStatus = x.ServiceStatus.ToString(), billingStatus = x.BillingStatus.ToString(),
                contacts = x.Memberships.Where(m => m.Role == TenantRole.Master && m.IsActive && m.User.IsActive)
                    .OrderBy(m => m.UserId).Select(m => new { name = m.User.DisplayName, m.User.Email, phone = m.User.PhoneNumber }).ToList() })
            .ToListAsync(token);
        return Ok(new { items = items.Select(x => new { x.Id, x.Name, x.BusinessRegistrationNumber, x.CreatedAt, x.Version, x.IsActive, x.serviceStatus, x.billingStatus, x.contacts, x.userCount, plan = "사용자당 월 요금제",
            lastLoginAt = (DateTimeOffset?)null, estimatedMonthlyKrw = (long)billing.Policy.MonthlyBaseKrw + (long)Math.Max(0,x.userCount-billing.Policy.IncludedUsers)*billing.Policy.MonthlyPerUserKrw,
            billingAccess = billing.EvaluateEntitlement(x.billingTenant),
            canReactivate = x.IsActive && billing.EvaluateEntitlement(x.billingTenant).CanAccessWms }), total, page, pageSize });
    }

    [HttpGet("{tenantId:guid}")]
    public async Task<IActionResult> Detail(Guid tenantId, [FromServices] IebleWms.Api.Billing.SubscriptionService subscriptions, CancellationToken token)
    {
        var tenant = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => new { x.Id, x.Code, x.Name, x.BusinessRegistrationNumber, x.RepresentativeName, x.Address, x.ContactName, x.ContactPhone, x.CreatedAt, serviceStatus=x.ServiceStatus.ToString(), billingStatus=x.BillingStatus.ToString() }).SingleOrDefaultAsync(token);
        if (tenant is null) return NotFound();
        var masters = await db.TenantMemberships.Where(x => x.TenantId==tenantId && x.Role==TenantRole.Master && x.IsActive && x.User.IsActive).Select(x=>new {name=x.User.DisplayName,x.User.Email}).ToListAsync(token);
        return Ok(new { tenant, masters, userCount = await db.TenantMemberships.CountAsync(x=>x.TenantId==tenantId && x.IsActive && x.User.IsActive,token),
            warehouseCount=await db.Warehouses.CountAsync(x=>x.TenantId==tenantId,token), productCount=await db.Products.CountAsync(x=>x.TenantId==tenantId,token),
            billing=await subscriptions.Read(tenantId,Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),token),
            policy=billing.Policy, lastLoginAt=(DateTimeOffset?)null,
            inquiries=await db.BillingFeedbacks.AsNoTracking().Where(x=>x.TenantId==tenantId).OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Take(10).Select(x=>new{x.Id,x.Number,x.Title,x.Status,x.CreatedAt}).ToListAsync(token) });
    }

    [HttpGet("{tenantId:guid}/history")]
    public async Task<IActionResult> History(Guid tenantId, CancellationToken token)
    {
        if (!await db.Tenants.AnyAsync(x => x.Id == tenantId, token)) return NotFound();
        var items = await db.TenantStatusChanges.AsNoTracking().Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.ChangedAt).ThenByDescending(x => x.Id).Take(100)
            .Select(x => new { x.Id, fromStatus = x.FromStatus.ToString(), toStatus = x.ToStatus.ToString(), x.Reason, x.ChangedAt, x.ChangedByUserId, administrator = x.ChangedByUser.DisplayName }).ToListAsync(token);
        return Ok(new { items });
    }

    [HttpPost("{tenantId:guid}/status")]
    public async Task<IActionResult> Change(Guid tenantId, ChangeTenantStatusRequest request, CancellationToken token)
    {
        var result = await administration.ChangeAsync(Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), tenantId, request.Action, request.Version, request.Reason, token);
        return StatusCode(result.StatusCode, new { message = result.Message });
    }
}

public sealed class ChangeTenantStatusRequest
{
    [Required, RegularExpression("^(suspend|reactivate)$")] public string Action { get; set; } = "";
    public Guid Version { get; set; }
    [Required, StringLength(1000, MinimumLength = 1)] public string Reason { get; set; } = "";
}
