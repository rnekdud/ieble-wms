using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/inventory"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class InventoryController(InventoryService service):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet,Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> List(Guid tenantId,[FromQuery]InventoryQuery r,CancellationToken ct)=>service.List(tenantId,r,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>service.Detail(tenantId,id,ct);
    [HttpGet("{id:guid}/movements"),Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> Movements(Guid tenantId,Guid id,CancellationToken ct,int page=1)=>service.Movements(tenantId,id,page,ct);
    [HttpGet("history"),Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> History(Guid tenantId,CancellationToken ct,string? search=null,string type="all",Guid? stockId=null,int page=1,int pageSize=20)=>service.History(tenantId,search,type,stockId,page,pageSize,ct);
    [HttpGet("history/{id:guid}"),Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> Operation(Guid tenantId,Guid id,CancellationToken ct)=>service.Operation(tenantId,id,ct);
    [HttpGet("choices"),Authorize(Policy="Permission:stock-adjustments:read")]
    public Task<object> Choices(Guid tenantId,CancellationToken ct,string kind,string? search=null,Guid? warehouseId=null,Guid? rackId=null,int page=1,Guid? productId=null,Guid? locationId=null)=>service.Choices(tenantId,kind,search,warehouseId,rackId,page,ct,productId,locationId);
    [HttpPost("move"),Authorize(Policy="Permission:stock-adjustments:move")]
    public async Task<IActionResult> Move(Guid tenantId,InventoryRequest r,CancellationToken ct)=>StatusCode(201,await service.Execute(tenantId,Actor,r,true,ct));
    [HttpPost("adjust"),Authorize(Policy="Permission:stock-adjustments:adjust")]
    public async Task<IActionResult> Adjust(Guid tenantId,InventoryRequest r,CancellationToken ct)=>StatusCode(201,await service.Execute(tenantId,Actor,r,false,ct));
}
