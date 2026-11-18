using System.Security.Claims;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Support;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Controllers;

[ApiController,Route("api/tenants/{tenantId:guid}/support"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class SupportController(SupportService service):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet,Authorize(Policy="Permission:support:read")]
    public Task<object> List(Guid tenantId,[FromQuery]SupportQuery q,CancellationToken ct)=>service.List(tenantId,Actor,q,ct);
    [HttpGet("{id:guid}"),Authorize(Policy="Permission:support:read")]
    public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct)=>service.Detail(tenantId,Actor,id,ct);
    [HttpPost,Authorize(Policy="Permission:support:create"),RequestSizeLimit(16*1024*1024),RequestFormLimits(MultipartBodyLengthLimit=16*1024*1024)]
    public async Task<IActionResult> Create(Guid tenantId,[FromForm]SupportCreate request,CancellationToken ct)=>StatusCode(201,await service.Create(tenantId,Actor,request,ct));
    [HttpGet("{id:guid}/attachments/{fileId:guid}"),Authorize(Policy="Permission:support:read")]
    public async Task<IActionResult> Download(Guid tenantId,Guid id,Guid fileId,CancellationToken ct)
    {
        var f=await service.Download(tenantId,Actor,id,fileId,ct);Response.Headers.ContentSecurityPolicy="sandbox";Response.Headers.XContentTypeOptions="nosniff";return File(f.Content,f.ContentType,f.FileName);
    }
}
[ApiController,Route("api/admin/support"),Authorize(Policy="IebleAdministrator")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class AdminSupportController(SupportService service,WmsDbContext db):ControllerBase
{
    Guid Actor=>Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]public Task<object> List([FromQuery]SupportQuery q,CancellationToken ct)=>service.List(null,Actor,q,ct);
    [HttpGet("administrators")]public async Task<IActionResult> Administrators(CancellationToken ct)=>Ok(await db.Users.Where(x=>x.IsActive&&x.SystemRole==SystemRole.IebleAdministrator).OrderBy(x=>x.DisplayName).Select(x=>new{x.Id,name=x.DisplayName}).ToListAsync(ct));
    [HttpGet("{id:guid}")]public Task<object> Detail(Guid id,CancellationToken ct)=>service.Detail(null,Actor,id,ct);
    [HttpPost("{id:guid}")]public Task<object> Update(Guid id,SupportUpdate request,CancellationToken ct)=>service.Update(Actor,id,request,ct);
    [HttpGet("{id:guid}/attachments/{fileId:guid}")]public async Task<IActionResult> Download(Guid id,Guid fileId,CancellationToken ct)
    {
        var f=await service.Download(null,Actor,id,fileId,ct);Response.Headers.ContentSecurityPolicy="sandbox";Response.Headers.XContentTypeOptions="nosniff";return File(f.Content,f.ContentType,f.FileName);
    }
}
