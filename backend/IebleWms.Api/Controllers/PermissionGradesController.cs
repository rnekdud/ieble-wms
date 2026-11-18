using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PermissionGradesController(PermissionGradeService service) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("organization-items/permission-grades"), Authorize(Policy = "Permission:organization-items:read")]
    public async Task<IActionResult> List(Guid tenantId, CancellationToken token) => Ok(await service.ListAsync(tenantId, token));
    [HttpGet("users/permission-grades"), Authorize(Policy = "Permission:users:read")]
    public async Task<IActionResult> Options(Guid tenantId, CancellationToken token) => Ok(await service.ListAsync(tenantId, token));
    [HttpPost("organization-items/permission-grades"), Authorize(Policy = "Permission:organization-items:create")]
    public async Task<IActionResult> Create(Guid tenantId, PermissionGradeRequest request, CancellationToken token) => StatusCode(201, await service.SaveAsync(tenantId, Actor, null, request, token));
    [HttpPost("organization-items/permission-grades/{key}"), Authorize(Policy = "Permission:organization-items:update")]
    public async Task<IActionResult> Update(Guid tenantId, string key, PermissionGradeRequest request, CancellationToken token) => Ok(await service.SaveAsync(tenantId, Actor, key, request, token));
}
