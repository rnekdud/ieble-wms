using System.Security.Claims;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;
[ApiController, Route("api/tenants/{tenantId:guid}/plan-imports"), Authorize(Policy="TenantMember"), Authorize(Policy="Permission:warehouses:create")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class PlanImportsController(PlanImportService service):ControllerBase
{
    Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpPost,RequestSizeLimit(21*1024*1024),RequestFormLimits(MultipartBodyLengthLimit=21*1024*1024)]
    public async Task<IActionResult> Upload(Guid tenantId,IFormFile file,CancellationToken ct)=>Accepted(await service.Upload(tenantId,Actor,file,ct));
    [HttpGet("{id:guid}")] public object Read(Guid tenantId,Guid id)=>service.Read(tenantId,Actor,id);
    [HttpGet("{id:guid}/preview")] public IActionResult Preview(Guid tenantId,Guid id)=>File(service.Preview(tenantId,Actor,id),"image/png");
    public sealed record PageRequest(int Page,int Rotation);
    [HttpPost("{id:guid}/page")] public object Page(Guid tenantId,Guid id,PageRequest r)=>service.Page(tenantId,Actor,id,r.Page,r.Rotation);
    [HttpPost("{id:guid}/analyze")] public object Analyze(Guid tenantId,Guid id)=>service.Analyze(tenantId,Actor,id);
    [HttpPost("{id:guid}/discard")] public async Task<IActionResult> Discard(Guid tenantId,Guid id){await service.Discard(tenantId,Actor,id);return NoContent();}
}
