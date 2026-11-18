using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Shipping;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/shipments"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class ShipmentsController(ShipmentService service,IebleWms.Api.Products.ProductService products):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet,Authorize(Policy="Permission:shipments:read")]
    public Task<object> List(Guid tenantId,CancellationToken ct,string? search=null,string status="all",Guid? warehouseId=null,DateOnly? from=null,DateOnly? to=null,int page=1,int pageSize=20)=>service.List(tenantId,search,status,warehouseId,from,to,page,pageSize,ct);
    [HttpGet("choices"),Authorize(Policy="Permission:shipments:read")]
    public Task<object> Choices(Guid tenantId,CancellationToken ct,[FromQuery]IebleWms.Api.Products.ProductSelectionQuery selection,[FromQuery]ShipmentRackQuery rackQuery,string kind,string? search=null,Guid? warehouseId=null,int page=1,string? exactName=null,string? exactUnit=null,Guid? productId=null)=>service.Choices(tenantId,kind,search,warehouseId,page,ct,exactName,exactUnit,selection,productId,rackQuery);
    [HttpGet("products/{id:guid}/image"),Authorize(Policy="Permission:shipments:read")]
    public async Task<IActionResult> ProductImage(Guid tenantId,Guid id,CancellationToken ct)
    {
        var image=await products.Image(tenantId,id,ct);Response.Headers["X-Content-Type-Options"]="nosniff";return File(image.Content,image.ContentType);
    }
    [HttpGet("paste-template"),Authorize(Policy="Permission:shipments:read")]
    public Task<FileContentResult> PasteTemplate(CancellationToken ct)=>IebleWms.Api.Reports.DocumentPasteTemplate.Download(true,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:shipments:read")]
    public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>service.Detail(tenantId,id,ct);
    [HttpGet("stock"),Authorize(Policy="Permission:shipments:read")]
    public Task<object> Stock(Guid tenantId,Guid warehouseId,Guid productId,CancellationToken ct,int page=1)=>service.Stock(tenantId,warehouseId,productId,page,ct);
    [HttpPost,Authorize(Policy="Permission:shipments:create")]
    public async Task<IActionResult> Create(Guid tenantId,ShipmentRequest r,CancellationToken ct)=>StatusCode(201,await service.SaveShipment(tenantId,Actor,null,r,ct));
    [HttpPost("{id:guid}"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> Update(Guid tenantId,Guid id,ShipmentRequest r,CancellationToken ct)=>service.SaveShipment(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/start-picking"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> Start(Guid tenantId,Guid id,ShipmentVersionRequest r,CancellationToken ct)=>service.Transition(tenantId,Actor,id,r,false,ct);
    [HttpPost("{id:guid}/cancel"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> Cancel(Guid tenantId,Guid id,ShipmentVersionRequest r,CancellationToken ct)=>service.Transition(tenantId,Actor,id,r,true,ct);
    [HttpPost("{id:guid}/picking"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> Pick(Guid tenantId,Guid id,ShipmentWorkRequest r,CancellationToken ct)=>service.Work(tenantId,Actor,id,r,false,ct);
    [HttpPost("{id:guid}/inspection"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> Inspect(Guid tenantId,Guid id,ShipmentWorkRequest r,CancellationToken ct)=>service.Work(tenantId,Actor,id,r,true,ct);
    [HttpPost("{id:guid}/scan-picking"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> ScanPick(Guid tenantId,Guid id,ShipmentScanRequest r,CancellationToken ct)=>service.Scan(tenantId,Actor,id,r,false,ct);
    [HttpPost("{id:guid}/scan-inspection"),Authorize(Policy="Permission:shipments:update")]
    public Task<object> ScanInspect(Guid tenantId,Guid id,ShipmentScanRequest r,CancellationToken ct)=>service.Scan(tenantId,Actor,id,r,true,ct);
    [HttpPost("{id:guid}/confirm"),Authorize(Policy="Permission:shipments:confirm")]
    public Task<object> Confirm(Guid tenantId,Guid id,ShipmentVersionRequest r,CancellationToken ct)=>service.Confirm(tenantId,Actor,id,r,ct);
}
