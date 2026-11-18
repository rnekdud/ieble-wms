using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Products;
using IebleWms.Api.Organization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/products"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class ProductsController(ProductService service,IAuthorizationService authorization):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("import-template"),Authorize(Policy="Permission:products:create")]
    public async Task<IActionResult> ImportTemplate(Guid tenantId,CancellationToken ct)=>File(await service.ImportTemplate(tenantId,ct),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","아이블WMS_상품대량등록_양식.xlsx");
    [HttpPost("import-preview"),Authorize(Policy="Permission:products:create"),RequestSizeLimit(8000000)]
    public Task<IActionResult> ImportPreview(Guid tenantId,ProductImportRequest request,CancellationToken ct)=>RunImport(tenantId,request,false,ct);
    [HttpPost("import"),Authorize(Policy="Permission:products:create"),RequestSizeLimit(8000000)]
    public Task<IActionResult> Import(Guid tenantId,ProductImportRequest request,CancellationToken ct)=>RunImport(tenantId,request,true,ct);
    async Task<IActionResult> RunImport(Guid tenantId,ProductImportRequest request,bool commit,CancellationToken ct)
    {
        try { return Ok(await service.ImportProducts(tenantId,Actor,request,commit,ct)); }
        catch(OrganizationException e) when(e.StatusCode is 400 or 409 or 413)
        {
            // File/request-level failures have no Excel row. Preserve structured details even on non-2xx responses.
            return StatusCode(e.StatusCode,new {committed=false,total=0,valid=0,invalid=0,
                errors=new[]{new ProductImportError(0,commit?"일괄등록":"파일","",e.Message)},rows=Array.Empty<object>()});
        }
    }
    [HttpGet,Authorize(Policy="Permission:products:read")]
    public Task<object> List(Guid tenantId,CancellationToken ct,string? search=null,Guid? categoryId=null,string status="all",int page=1,int pageSize=20)=>service.List(tenantId,search,categoryId,status,page,pageSize,ct);
    [HttpGet("options"),Authorize(Policy="Permission:products:read")]
    public Task<object> Options(Guid tenantId,CancellationToken ct)=>service.Options(tenantId,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:products:read")]
    public async Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>await service.Detail(tenantId,id,ct,await CanWrite());
    [HttpPost,Authorize(Policy="Permission:products:create")]
    public async Task<IActionResult> Create(Guid tenantId,ProductRequest request,CancellationToken ct)=>StatusCode(201,await service.SaveProduct(tenantId,Actor,null,request,ct));
    [HttpPost("{id:guid}"),Authorize(Policy="Permission:products:update")]
    public async Task<IActionResult> Update(Guid tenantId,Guid id,ProductRequest request,CancellationToken ct)=>Ok(await service.SaveProduct(tenantId,Actor,id,request,ct));
    [HttpPost("{id:guid}/status"),Authorize(Policy="Permission:products:update")]
    public async Task<IActionResult> Status(Guid tenantId,Guid id,ProductStatusRequest request,CancellationToken ct)=>Ok(await service.Status(tenantId,Actor,id,request,ct));
    [HttpPost("delete-check"),Authorize(Policy="Permission:products:delete")]
    public Task<ProductDeletionReview> DeleteCheck(Guid tenantId,ProductDeleteRequest request,CancellationToken ct)=>service.ReviewDeletion(tenantId,request,ct);
    [HttpPost("delete"),Authorize(Policy="Permission:products:delete")]
    public Task<object> DeleteMany(Guid tenantId,ProductDeleteRequest request,CancellationToken ct)=>service.DeleteProducts(tenantId,Actor,request,ct);
    [HttpPost("{id:guid}/delete"),Authorize(Policy="Permission:products:delete")]
    public Task<object> DeleteOne(Guid tenantId,Guid id,ProductStatusRequest request,CancellationToken ct)=>service.DeleteProducts(tenantId,Actor,new(){Items=[new(id,request.Version)]},ct);
    [HttpPost("categories")]
    public async Task<IActionResult> Category(Guid tenantId,ProductCategoryRequest request,CancellationToken ct)=>await CanWrite()?Ok(await service.Category(tenantId,Actor,request,ct)):Forbid();
    [HttpPost("categories/{id:guid}"),Authorize(Policy="Permission:products:update")]
    public async Task<IActionResult> UpdateCategory(Guid tenantId,Guid id,ProductCategoryRequest request,CancellationToken ct)=>Ok(await service.SaveCategory(tenantId,Actor,id,request,ct));
    [HttpPost("types")]
    public async Task<IActionResult> Type(Guid tenantId,ProductCategoryRequest request,CancellationToken ct)=>await CanWrite()?Ok(await service.SaveType(tenantId,Actor,null,request,ct)):Forbid();
    [HttpPost("types/{id:guid}"),Authorize(Policy="Permission:products:update")]
    public async Task<IActionResult> UpdateType(Guid tenantId,Guid id,ProductCategoryRequest request,CancellationToken ct)=>Ok(await service.SaveType(tenantId,Actor,id,request,ct));
    [HttpGet("{id:guid}/image"),Authorize(Policy="Permission:products:read")]
    public async Task<IActionResult> Image(Guid tenantId,Guid id,CancellationToken ct) {
        var image=await service.Image(tenantId,id,ct);Response.Headers["X-Content-Type-Options"]="nosniff";return File(image.Content,image.ContentType);
    }
    [HttpGet("{id:guid}/images/{imageId:guid}"),Authorize(Policy="Permission:products:read")]
    public async Task<IActionResult> GalleryImage(Guid tenantId,Guid id,Guid imageId,CancellationToken ct) {
        var image=await service.Image(tenantId,id,ct,imageId);Response.Headers["X-Content-Type-Options"]="nosniff";return File(image.Content,image.ContentType);
    }
    [HttpPost("barcode-candidates")]
    public async Task<IActionResult> Candidate(Guid tenantId,CancellationToken ct)=>await CanWrite()?Ok(await service.GenerateBarcode(tenantId,ct)):Forbid();
    async Task<bool> CanWrite()=>(await authorization.AuthorizeAsync(User,null,"Permission:products:create")).Succeeded||(await authorization.AuthorizeAsync(User,null,"Permission:products:update")).Succeeded;
}
