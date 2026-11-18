using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/stocktakes"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class StocktakesController(StocktakeService service,IAuthorizationService authorization,IebleWms.Api.Products.ProductService products):ControllerBase
{
 Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
 [HttpGet,Authorize(Policy="Permission:stocktake:read")]
 public Task<object> List(Guid tenantId,CancellationToken ct,string? search=null,string? status=null,Guid? warehouseId=null,DateOnly? from=null,DateOnly? to=null,int page=1)=>service.List(tenantId,search,status,warehouseId,from,to,page,ct);
 [HttpGet("{id:guid}"),Authorize(Policy="Permission:stocktake:read")]
 public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>service.Detail(tenantId,id,ct);
 [HttpGet("{id:guid}/items"),Authorize(Policy="Permission:stocktake:read")]
 public Task<object> Items(Guid tenantId,Guid id,CancellationToken ct,string? search=null,string state="all",int page=1)=>service.Items(tenantId,id,search,state,page,ct);
 [HttpGet("{id:guid}/history"),Authorize(Policy="Permission:stocktake:read")]
 public Task<object> History(Guid tenantId,Guid id,CancellationToken ct,int page=1)=>service.History(tenantId,id,page,ct);
 [HttpGet("choices"),Authorize(Policy="Permission:stocktake:read")]
 public Task<object> Choices(Guid tenantId,CancellationToken ct,[FromQuery]IebleWms.Api.Products.ProductSelectionQuery selection,string kind,string? search=null,Guid? warehouseId=null,Guid? rackId=null,int page=1)=>service.Choices(tenantId,kind,search,warehouseId,rackId,page,ct,selection);
 [HttpPost,Authorize(Policy="Permission:stocktake:create")]
 public async Task<IActionResult> Create(Guid tenantId,StocktakeRequest r,CancellationToken ct)
 {if(r.Scope=="Selected"&&!(await authorization.AuthorizeAsync(User,"Permission:stocktake:count")).Succeeded)return Forbid();return StatusCode(201,await service.Create(tenantId,Actor,r,ct));}
 [HttpPost("{id:guid}/counts"),Authorize(Policy="Permission:stocktake:count")]
 public Task<object> Counts(Guid tenantId,Guid id,StocktakeCountRequest r,CancellationToken ct)=>service.Counts(tenantId,Actor,id,r,false,ct);
 [HttpPost("{id:guid}/reasons"),Authorize(Policy="Permission:stocktake:update")]
 public Task<object> Reasons(Guid tenantId,Guid id,StocktakeCountRequest r,CancellationToken ct)=>service.Counts(tenantId,Actor,id,r,true,ct);
 [HttpPost("{id:guid}/found"),Authorize(Policy="Permission:stocktake:count")]
 public Task<object> Found(Guid tenantId,Guid id,StocktakeFoundRequest r,CancellationToken ct)=>service.Found(tenantId,Actor,id,r,ct);
 [HttpPost("{id:guid}/start"),HttpPost("{id:guid}/complete"),HttpPost("{id:guid}/reopen"),HttpPost("{id:guid}/reconfirm"),Authorize(Policy="Permission:stocktake:count")]
 public Task<object> CountAction(Guid tenantId,Guid id,StocktakeAction r,CancellationToken ct)=>service.Action(tenantId,Actor,id,Request.Path.Value!.Split('/')[^1],r,ct);
 [HttpPost("{id:guid}/review"),HttpPost("{id:guid}/cancel"),Authorize(Policy="Permission:stocktake:update")]
 public Task<object> ReviewAction(Guid tenantId,Guid id,StocktakeAction r,CancellationToken ct)=>service.Action(tenantId,Actor,id,Request.Path.Value!.Split('/')[^1],r,ct);
 [HttpPost("{id:guid}/confirm"),Authorize(Policy="Permission:stocktake:confirm")]
 public Task<object> Confirm(Guid tenantId,Guid id,StocktakeAction r,CancellationToken ct)=>service.Action(tenantId,Actor,id,"confirm",r,ct);
 [HttpGet("candidates"),Authorize(Policy="Permission:stocktake:read")]
 public Task<object> Candidates(Guid tenantId,Guid warehouseId,CancellationToken ct,Guid? rackId=null,string? search=null,int page=1,Guid? productId=null)=>service.Candidates(tenantId,warehouseId,rackId,search,page,ct,productId);
 [HttpGet("products/{id:guid}/image"),Authorize(Policy="Permission:stocktake:read")]
 public async Task<IActionResult> Image(Guid tenantId,Guid id,CancellationToken ct){var image=await products.Image(tenantId,id,ct);Response.Headers["X-Content-Type-Options"]="nosniff";return File(image.Content,image.ContentType);}
 [HttpPost("{id:guid}/draft"),Authorize(Policy="Permission:stocktake:count")]
 public Task<object> Draft(Guid tenantId,Guid id,StocktakeDraftRequest r,CancellationToken ct)=>service.Draft(tenantId,Actor,id,r,ct);
 [HttpPost("{id:guid}/selection"),Authorize(Policy="Permission:stocktake:count")]
 public Task<object> Selection(Guid tenantId,Guid id,StocktakeSelectionRequest r,CancellationToken ct)=>service.Selection(tenantId,Actor,id,r,ct);
 [HttpPost("{id:guid}/confirm-selected"),Authorize(Policy="Permission:stocktake:confirm"),Authorize(Policy="Permission:stocktake:update")]
 public Task<object> ConfirmSelected(Guid tenantId,Guid id,StocktakeAction r,CancellationToken ct)=>service.Action(tenantId,Actor,id,"confirm-selected",r,ct);
}
