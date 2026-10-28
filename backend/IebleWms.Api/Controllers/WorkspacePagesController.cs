using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/pages"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class WorkspacePagesController(IAuthorizationService authorization) : ControllerBase
{
    private static readonly HashSet<string> Business = ["dashboard", "warehouses", "products", "receipts", "shipments", "stock-adjustments", "stocktake", "partners", "stock-overview", "movement-stats", "stock-history"];
    private static readonly HashSet<string> Settings = ["company", "users", "billing"];
    [HttpGet("{page}")]
    public async Task<IActionResult> Page(Guid tenantId, string page)
    {
        if (!Business.Contains(page) && !Settings.Contains(page) && page != "support") return NotFound();
        if (Settings.Contains(page) && !(await authorization.AuthorizeAsync(User, HttpContext, "TenantAdministrator")).Succeeded) return Forbid();
        if (Business.Contains(page) && !(await authorization.AuthorizeAsync(User, HttpContext, "ActiveTenant")).Succeeded) return Forbid();
        // Shell permissions only. No operational data/CRUD exists yet, so no fabricated counts or rows.
        return Ok(new { tenantId, page, hasData = false });
    }
}
