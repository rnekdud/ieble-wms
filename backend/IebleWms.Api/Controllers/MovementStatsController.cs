using IebleWms.Api.Contracts;
using IebleWms.Api.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/reports/movement-stats"),Authorize(Policy="TenantMember"),Authorize(Policy="Permission:movement-stats:read")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class MovementStatsController(MovementStatsService service):ControllerBase
{
 [HttpGet] public Task<object> List(Guid tenantId,[FromQuery]MovementStatsQuery q,CancellationToken ct)=>service.List(tenantId,q,ct);
 [HttpGet("summary")] public Task<object> Summary(Guid tenantId,[FromQuery]MovementStatsQuery q,CancellationToken ct)=>service.GetSummary(tenantId,q,ct);
 [HttpGet("trend")] public Task<object> Trend(Guid tenantId,[FromQuery]MovementStatsQuery q,CancellationToken ct)=>service.GetTrend(tenantId,q,ct);
 [HttpGet("choices")] public Task<object> Choices(Guid tenantId,CancellationToken ct,string kind,string? search=null,int page=1)=>service.Choices(tenantId,kind,search,page,ct);
 [HttpGet("export"),EnableRateLimiting("stock-overview-export")]
 public async Task<IActionResult> Export(Guid tenantId,[FromQuery]MovementStatsQuery q,CancellationToken ct,string format="xlsx"){var f=await service.Export(tenantId,q,format,ct);return File(f.stream,f.contentType,f.filename);}
}
