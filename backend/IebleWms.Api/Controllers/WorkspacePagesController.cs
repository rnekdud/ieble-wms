using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/pages"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class WorkspacePagesController(IAuthorizationService authorization) : ControllerBase
{
    [HttpGet("{page}")]
    public async Task<IActionResult> Page(Guid tenantId, string page)
    {
        if (page is "billing" or "permissions")
        {
            if (!(await authorization.AuthorizeAsync(User, HttpContext, "TenantMaster")).Succeeded) return Forbid();
        }
        else
        {
            if (!PermissionCatalog.Features.Any(f => f.Key == page)) return NotFound();
            if (!(await authorization.AuthorizeAsync(User, HttpContext, $"Permission:{page}:read")).Succeeded) return Forbid();
        }
        // Business CRUD is not implemented; never fabricate operational data or action success.
        return Ok(new { tenantId, page, hasData = false });
    }
}
