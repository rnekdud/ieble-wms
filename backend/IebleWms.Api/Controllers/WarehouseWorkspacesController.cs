using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/warehouses"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class WarehouseWorkspacesController(WarehouseWorkspaceService service, IAuthorizationService authorization) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("{warehouseId:guid}/workspace"), Authorize(Policy = "Permission:warehouses:read")]
    public async Task<IActionResult> Read(Guid tenantId, Guid warehouseId, CancellationToken ct) => Ok(await service.Read(tenantId, warehouseId, ct));
    [HttpPost("workspace"), Authorize(Policy = "Permission:warehouses:create"), RequestSizeLimit(2_000_000)]
    public async Task<IActionResult> Create(Guid tenantId, SaveWarehouseWorkspaceRequest request, CancellationToken ct) => StatusCode(201, await service.Save(tenantId, null, Actor, request, true, ct));
    [HttpPost("{warehouseId:guid}/workspace"), Authorize(Policy = "Permission:warehouses:update"), RequestSizeLimit(2_000_000)]
    public async Task<IActionResult> Update(Guid tenantId, Guid warehouseId, SaveWarehouseWorkspaceRequest request, CancellationToken ct)
    {
        var canCreate = (await authorization.AuthorizeAsync(User, null, "Permission:warehouses:create")).Succeeded;
        return Ok(await service.Save(tenantId, warehouseId, Actor, request, canCreate, ct));
    }
}
