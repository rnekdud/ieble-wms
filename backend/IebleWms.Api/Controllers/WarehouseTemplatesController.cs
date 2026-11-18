using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/warehouse-templates"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class WarehouseTemplatesController(WarehouseTemplateService service):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet,Authorize(Policy="Permission:warehouses:read")] public Task<object> List(Guid tenantId,CancellationToken ct,string? search=null,int page=1)=>service.List(tenantId,search,page,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:warehouses:read")] public Task<object> Read(Guid tenantId,Guid id,CancellationToken ct)=>service.Read(tenantId,id,ct);
    [HttpPost,Authorize(Policy="Permission:warehouses:create")] public async Task<IActionResult> Create(Guid tenantId,SaveWarehouseTemplateRequest r,CancellationToken ct)=>StatusCode(201,await service.Save(tenantId,Actor,null,r,ct));
    [HttpPost("{id:guid}"),Authorize(Policy="Permission:warehouses:update")] public Task<object> Update(Guid tenantId,Guid id,SaveWarehouseTemplateRequest r,CancellationToken ct)=>service.Save(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/archive"),Authorize(Policy="Permission:warehouses:update")] public Task<object> Archive(Guid tenantId,Guid id,ArchiveWarehouseTemplateRequest r,CancellationToken ct)=>service.Archive(tenantId,Actor,id,r.Version,ct);
}
