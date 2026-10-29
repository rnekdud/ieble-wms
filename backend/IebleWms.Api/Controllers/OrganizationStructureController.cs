using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Organization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class OrganizationStructureController(OrganizationStructureService service, EmployeeService employees) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("organization-chart"), Authorize(Policy = "Permission:org-chart:read")]
    public async Task<IActionResult> Chart(Guid tenantId, CancellationToken token) => Ok(await service.ChartAsync(tenantId, token));
    [HttpGet("organization-items"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:organization-items:read")]
    public async Task<IActionResult> Items(Guid tenantId, CancellationToken token) => Ok(await service.ListAsync(tenantId, token));
    [HttpGet("users/organization-options"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:users:read")]
    public async Task<IActionResult> Options(Guid tenantId, CancellationToken token) => Ok(await service.ListAsync(tenantId, token));
    [HttpPost("organization-items/{kind}"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:organization-items:create")]
    public async Task<IActionResult> Create(Guid tenantId, string kind, OrganizationItemRequest request, CancellationToken token) => StatusCode(201, await service.SaveAsync(tenantId, Actor, kind, null, request, token));
    [HttpPost("organization-items/{kind}/{id:guid}"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:organization-items:update")]
    public async Task<IActionResult> Update(Guid tenantId, string kind, Guid id, OrganizationItemRequest request, CancellationToken token) => Ok(await service.SaveAsync(tenantId, Actor, kind, id, request, token));
    [HttpPost("organization-items/{kind}/{id:guid}/delete"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:organization-items:delete")]
    public async Task<IActionResult> Delete(Guid tenantId, string kind, Guid id, OrganizationItemDeleteRequest request, CancellationToken token) { await service.DeleteAsync(tenantId, Actor, kind, id, request.Version, token); return NoContent(); }
    [HttpPost("users/{userId:guid}/organization"), Authorize(Policy = "TenantMaster")]
    public async Task<IActionResult> MasterOrganization(Guid tenantId, Guid userId, MemberOrganizationRequest request, CancellationToken token) => Ok(await employees.AssignMasterOrganizationAsync(tenantId, Actor, userId, request, token));
}
