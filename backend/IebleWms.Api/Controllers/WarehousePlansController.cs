using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/warehouses/{warehouseId:guid}"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class WarehousePlansController(WarehousePlanService service):ControllerBase
{
    [HttpGet("plan"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> Read(Guid tenantId,Guid warehouseId,CancellationToken ct)=>Ok(await service.Read(tenantId,warehouseId,ct));
    [HttpPost("plan"),Authorize(Policy="Permission:warehouses:update"),RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> Save(Guid tenantId,Guid warehouseId,SaveWarehousePlanRequest request,CancellationToken ct)=>Ok(await service.Save(tenantId,warehouseId,Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),request,ct));
    [HttpGet("plan/history"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> History(Guid tenantId,Guid warehouseId,CancellationToken ct)=>Ok(await service.History(tenantId,warehouseId,ct));
    [HttpGet("racks/{rackId:guid}/front"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> Rack(Guid tenantId,Guid warehouseId,Guid rackId,CancellationToken ct)=>Ok(await service.Rack(tenantId,warehouseId,rackId,ct));
}
