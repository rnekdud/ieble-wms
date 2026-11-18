using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/warehouses/{warehouseId:guid}"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class WarehousePlansController(WarehousePlanService service,IAuthorizationService authorization):ControllerBase
{
    [HttpGet("plan"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> Read(Guid tenantId,Guid warehouseId,CancellationToken ct)=>Ok(await service.Read(tenantId,warehouseId,ct));
    [HttpPost("plan"),Authorize(Policy="Permission:warehouses:update"),RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> Save(Guid tenantId,Guid warehouseId,SaveWarehousePlanRequest request,CancellationToken ct)=>Ok(await service.Save(tenantId,warehouseId,Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),request,ct));
    [HttpPost("racks/delete"), Authorize(Policy="Permission:warehouses:delete"), Authorize(Policy="Permission:warehouses:update")]
    public async Task<IActionResult> DeleteRacks(Guid tenantId, Guid warehouseId, DeleteWarehouseRacksRequest request, CancellationToken ct)
        => Ok(await service.DeleteRacks(tenantId, warehouseId, Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), request, ct));
    [HttpGet("plan/history"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> History(Guid tenantId,Guid warehouseId,CancellationToken ct)=>Ok(await service.History(tenantId,warehouseId,ct));
    [HttpGet("racks/{rackId:guid}/front"),Authorize(Policy="Permission:warehouses:read")]
    public async Task<IActionResult> Rack(Guid tenantId,Guid warehouseId,Guid rackId,CancellationToken ct)=>Ok(await service.Rack(tenantId,warehouseId,rackId,ct,
        (await authorization.AuthorizeAsync(User,null,"Permission:stock-overview:read")).Succeeded));
    [HttpGet("racks/{rackId:guid}/stock"),Authorize(Policy="Permission:warehouses:read"),Authorize(Policy="Permission:stock-overview:read")]
    public async Task<IActionResult> RackStock(Guid tenantId,Guid warehouseId,Guid rackId,
        [FromServices] IebleWms.Api.Reports.StockOverviewService stock,CancellationToken ct,
        Guid? locationId=null,int page=1)
    {
        await service.RequireRackLocation(tenantId,warehouseId,rackId,locationId,ct);
        return Ok(await stock.List(tenantId,new StockOverviewQuery{View="location",WarehouseId=warehouseId,RackId=rackId,LocationId=locationId,Page=page,PageSize=20},ct));
    }
}
