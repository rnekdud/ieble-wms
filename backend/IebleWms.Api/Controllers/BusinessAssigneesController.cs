using System.Security.Claims;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/assignees"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class BusinessAssigneesController(WmsDbContext db, TenantPermissionService permissions) : ControllerBase
{
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Saved(Guid tenantId, Guid userId, string kind, CancellationToken ct)
    {
        var actor = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (kind is not ("receipts" or "shipments" or "stocktake" or "stock-adjustments" or "warehouses") ||
            !await permissions.AllowsAsync(actor, tenantId, kind, "read", ct)) return Forbid();
        var member = await BusinessAssignees.Saved(db, tenantId, userId, ct);
        return member is null ? NotFound() : Ok(member);
    }

    [HttpGet("choices")]
    public async Task<IActionResult> Choices(Guid tenantId, string kind, CancellationToken ct, string? search = null, int page = 1)
    {
        var actor = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (kind is not ("receipts" or "shipments" or "stocktake" or "stock-adjustments" or "warehouses") ||
            !await permissions.AllowsAsync(actor, tenantId, kind, "read", ct)) return Forbid();
        return Ok(await BusinessAssignees.Choices(db, tenantId, search, page, ct));
    }
}
