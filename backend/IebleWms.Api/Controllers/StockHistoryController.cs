using IebleWms.Api.Contracts;
using IebleWms.Api.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/reports/stock-history"),Authorize(Policy="TenantMember"),Authorize(Policy="Permission:stock-history:read")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class StockHistoryController(StockHistoryService service):ControllerBase
{
 [HttpGet] public Task<object> List(Guid tenantId,[FromQuery]StockHistoryQuery q,CancellationToken ct)=>service.List(tenantId,q,ct);
 [HttpGet("summary")] public Task<object> Summary(Guid tenantId,[FromQuery]StockHistoryQuery q,CancellationToken ct)=>service.GetSummary(tenantId,q,ct);
 [HttpGet("{id:guid}")] public Task<object> Detail(Guid tenantId,Guid id,CancellationToken ct,int page=1)=>service.Detail(tenantId,id,page,ct);
 [HttpGet("choices")] public Task<object> Choices(Guid tenantId,CancellationToken ct,string kind,string? search=null,Guid? warehouseId=null,Guid? rackId=null,int page=1)=>service.Choices(tenantId,kind,search,warehouseId,rackId,page,ct);
 [HttpGet("export"),EnableRateLimiting("stock-overview-export")]
 public async Task<IActionResult> Export(Guid tenantId,[FromQuery]StockHistoryQuery q,CancellationToken ct,string format="xlsx"){var r=await service.Export(tenantId,q,format,ct);return File(r.stream,r.contentType,r.filename);}
}
