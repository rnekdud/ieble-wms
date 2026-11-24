using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Receiving;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/receipts"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class ReceiptsController(ReceiptService service,IebleWms.Api.Products.ProductService products):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet,Authorize(Policy="Permission:receipts:read")]
    public Task<object> List(Guid tenantId,CancellationToken ct,string? search=null,string status="all",Guid? warehouseId=null,DateOnly? from=null,DateOnly? to=null,int page=1,int pageSize=20)=>service.List(tenantId,search,status,warehouseId,from,to,page,pageSize,ct);
    [HttpGet("choices"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> Choices(Guid tenantId,CancellationToken ct,[FromQuery]IebleWms.Api.Products.ProductSelectionQuery selection,string kind,string? search=null,Guid? warehouseId=null,int page=1,string? exactName=null,string? exactUnit=null,Guid? rackId=null)=>service.Choices(tenantId,kind,search,warehouseId,page,ct,exactName,exactUnit,selection,rackId);
    [HttpGet("products/{id:guid}/image"),Authorize(Policy="Permission:receipts:read")]
    public async Task<IActionResult> ProductImage(Guid tenantId,Guid id,CancellationToken ct)
    {
        var image=await products.Image(tenantId,id,ct);Response.Headers["X-Content-Type-Options"]="nosniff";return File(image.Content,image.ContentType);
    }
    [HttpGet("paste-template"),Authorize(Policy="Permission:receipts:read")]
    public Task<FileContentResult> PasteTemplate(CancellationToken ct)=>IebleWms.Api.Reports.DocumentPasteTemplate.Download(false,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>service.Detail(tenantId,id,ct);
    [HttpGet("photo-options"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> PhotoOptions(Guid tenantId,CancellationToken ct)=>service.PhotoOptions(tenantId,ct);
    [HttpGet("{id:guid}/photos"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> Photos(Guid tenantId,Guid id,CancellationToken ct)=>service.Photos(tenantId,id,ct);
    [HttpGet("{id:guid}/photos/{photoId:guid}"),Authorize(Policy="Permission:receipts:read")]
    public async Task<IActionResult> Photo(Guid tenantId,Guid id,Guid photoId,CancellationToken ct,bool thumbnail=false)
    {
        var photo=await service.Photo(tenantId,id,photoId,thumbnail,ct);
        Response.Headers["X-Content-Type-Options"]="nosniff";
        return File(photo.Content,photo.ContentType);
    }
    [RequestSizeLimit(80 * 1024 * 1024)]
    [HttpPost("{id:guid}/photos"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> SavePhotos(Guid tenantId,Guid id,ReceiptPhotosRequest r,CancellationToken ct)=>service.UpdatePhotos(tenantId,Actor,id,r,ct);
    [HttpGet("{id:guid}/stock"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> Stock(Guid tenantId,Guid id,CancellationToken ct)=>service.Stock(tenantId,id,ct);
    [RequestSizeLimit(80 * 1024 * 1024)]
    [HttpPost,Authorize(Policy="Permission:receipts:create")]
    public async Task<IActionResult> Create(Guid tenantId,ReceiptRequest r,CancellationToken ct)=>StatusCode(201,await service.SaveReceipt(tenantId,Actor,null,r,ct));
    [RequestSizeLimit(80 * 1024 * 1024)]
    [HttpPost("{id:guid}"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Update(Guid tenantId,Guid id,ReceiptRequest r,CancellationToken ct)=>service.SaveReceipt(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/start-inspection"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Start(Guid tenantId,Guid id,ReceiptVersionRequest r,CancellationToken ct)=>service.Transition(tenantId,Actor,id,r,false,ct);
    [HttpPost("{id:guid}/cancel"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Cancel(Guid tenantId,Guid id,ReceiptVersionRequest r,CancellationToken ct)=>service.Transition(tenantId,Actor,id,r,true,ct);
    [HttpPost("{id:guid}/inspection"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Inspect(Guid tenantId,Guid id,ReceiptInspectionRequest r,CancellationToken ct)=>service.Inspect(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/scan-inspection"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Scan(Guid tenantId,Guid id,ReceiptScanRequest r,CancellationToken ct)=>service.Scan(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/inspection-quantity"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Quantity(Guid tenantId,Guid id,ReceiptQuantityRequest r,CancellationToken ct)=>service.CorrectQuantity(tenantId,Actor,id,r,ct);
    [HttpGet("{id:guid}/inspection-history"),Authorize(Policy="Permission:receipts:read")]
    public Task<object> History(Guid tenantId,Guid id,CancellationToken ct,int page=1)=>service.InspectionHistory(tenantId,id,page,ct);
    [HttpPost("{id:guid}/tracking"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Tracking(Guid tenantId,Guid id,ReceiptTrackingRequest r,CancellationToken ct)=>service.SaveTracking(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/placements"),Authorize(Policy="Permission:receipts:update")]
    public Task<object> Place(Guid tenantId,Guid id,ReceiptPlacementRequest r,CancellationToken ct)=>service.Place(tenantId,Actor,id,r,ct);
    [HttpPost("{id:guid}/confirm"),Authorize(Policy="Permission:receipts:confirm")]
    public Task<object> Confirm(Guid tenantId,Guid id,ReceiptVersionRequest r,CancellationToken ct)=>service.Confirm(tenantId,Actor,id,r,ct);
}
