using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/partners"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PartnersController(PartnerService service) : ControllerBase
{
    Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet, Authorize(Policy = "Permission:partners:read")]
    public Task<object> List(Guid tenantId, CancellationToken ct, string? search = null, string type = "all", string status = "all", string? usage = null, int page = 1, int pageSize = 20) => service.List(tenantId, search, type, status, usage, page, pageSize, ct);
    [HttpGet("{id:guid}"), Authorize(Policy = "Permission:partners:read")]
    public async Task<IActionResult> Detail(Guid tenantId, Guid id, CancellationToken ct) => Ok(await service.Detail(tenantId, id, ct));
    [HttpGet("business-number-check"), Authorize(Policy = "Permission:partners:read")]
    public Task<object> Check(Guid tenantId, CancellationToken ct, string? number = null, string country = "KR", Guid? excludeId = null) => service.CheckBusinessNumber(tenantId, number, country, excludeId, ct);
    [HttpPost, Authorize(Policy = "Permission:partners:create")]
    public async Task<IActionResult> Create(Guid tenantId, PartnerRequest request, CancellationToken ct) => StatusCode(201, await service.SavePartner(tenantId, Actor, null, request, ct));
    [HttpPost("{id:guid}"), Authorize(Policy = "Permission:partners:update")]
    public async Task<IActionResult> Update(Guid tenantId, Guid id, PartnerRequest request, CancellationToken ct) => Ok(await service.SavePartner(tenantId, Actor, id, request, ct));
    [HttpPost("{id:guid}/status"), Authorize(Policy = "Permission:partners:update")]
    public async Task<IActionResult> Status(Guid tenantId, Guid id, PartnerStatusRequest request, CancellationToken ct) => Ok(await service.Status(tenantId, Actor, id, request, ct));
}
