using System.Security.Claims;
using IebleWms.Api.Labels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/label-designs"),Authorize(Policy="TenantMember"),ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class LabelDesignsController(LabelDesignService service):ControllerBase {
 Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
 [HttpGet,Authorize(Policy="Permission:products:read")] public Task<object> List(Guid tenantId,CancellationToken ct,string kind="template",int page=1,string? search=null)=>service.List(tenantId,kind,page,search,ct);
 [HttpGet("{id:guid}"),Authorize(Policy="Permission:products:read")] public Task<object> Read(Guid tenantId,Guid id,CancellationToken ct)=>service.Read(tenantId,id,ct);
 [HttpPost,RequestSizeLimit(20*1024*1024),Authorize(Policy="Permission:products:create")]public async Task<IActionResult> Create(Guid tenantId,SaveLabelDesign r,CancellationToken ct)=>StatusCode(201,await service.Save(tenantId,Actor,null,r,ct));
 [HttpPost("{id:guid}"),RequestSizeLimit(20*1024*1024),Authorize(Policy="Permission:products:update")]public Task<object> Update(Guid tenantId,Guid id,SaveLabelDesign r,CancellationToken ct)=>service.Save(tenantId,Actor,id,r,ct);
 [HttpPost("{id:guid}/archive"),Authorize(Policy="Permission:products:update")]public Task<object> Archive(Guid tenantId,Guid id,LabelVersion r,CancellationToken ct)=>service.Archive(tenantId,Actor,id,r.Version,ct);
 [HttpPost("pdf"),RequestSizeLimit(28*1024*1024),EnableRateLimiting("stock-overview-export"),Authorize(Policy="Permission:products:read")]public IActionResult Pdf(Guid tenantId,LabelPdfRequest r)=>File(LabelPdf.Create(r),"application/pdf","Labels.pdf");
}
