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
        var total = await query.CountAsync(token);
        var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { billingTenant = x, x.Id, x.Name, x.BusinessRegistrationNumber, x.CreatedAt, x.Version, x.IsActive,
                serviceStatus = x.ServiceStatus.ToString(), billingStatus = x.BillingStatus.ToString(),
                contacts = x.Memberships.Where(m => m.Role == TenantRole.Master && m.IsActive && m.User.IsActive)
                    .OrderBy(m => m.UserId).Select(m => new { name = m.User.DisplayName, m.User.Email, phone = m.User.PhoneNumber }).ToList() })
            .ToListAsync(token);
        return Ok(new { items = items.Select(x => new { x.Id, x.Name, x.BusinessRegistrationNumber, x.CreatedAt, x.Version, x.IsActive, x.serviceStatus, x.billingStatus, x.contacts,
            billingAccess = billing.EvaluateEntitlement(x.billingTenant),
            canReactivate = x.IsActive && billing.EvaluateEntitlement(x.billingTenant).CanAccessWms }), total, page, pageSize });
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
