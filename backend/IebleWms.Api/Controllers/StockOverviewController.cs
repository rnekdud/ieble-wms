using IebleWms.Api.Contracts;
using IebleWms.Api.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/reports/stock-overview"),Authorize(Policy="TenantMember"),Authorize(Policy="Permission:stock-overview:read")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class StockOverviewController(StockOverviewService service):ControllerBase
{
 [HttpGet] public Task<object> List(Guid tenantId,[FromQuery]StockOverviewQuery q,CancellationToken ct)=>service.List(tenantId,q,ct);
 [HttpGet("warehouse-summary")] public Task<object> WarehouseSummary(Guid tenantId,[FromQuery]StockOverviewQuery q,CancellationToken ct)=>service.WarehouseSummary(tenantId,q,ct);
 // Reuse the dashboard projection under inventory + warehouse read permissions.
 // Scheduled-work data stays redacted because this view does not request operational grants.
 [HttpGet("warehouses"),Authorize(Policy="Permission:warehouses:read")]
 public Task<object> Warehouses(Guid tenantId,[FromServices]WarehouseDashboardService map,CancellationToken ct)
  =>map.Warehouses(tenantId,ct,true);
 [HttpGet("warehouses/{warehouseId:guid}"),Authorize(Policy="Permission:warehouses:read")]
 public Task<object> Warehouse(Guid tenantId,Guid warehouseId,[FromServices]WarehouseDashboardService map,CancellationToken ct,Guid? rackId=null,Guid? locationId=null,int page=1)
  =>map.Read(tenantId,warehouseId,rackId,locationId,page,ct,new Dictionary<string,string[]>());
 [HttpGet("summary")] public Task<object> Summary(Guid tenantId,[FromQuery]StockOverviewQuery q,CancellationToken ct)=>service.GetSummary(tenantId,q,ct);
 [HttpGet("products/{productId:guid}")] public Task<object> Detail(Guid tenantId,Guid productId,[FromQuery]StockOverviewQuery q,CancellationToken ct)=>service.Detail(tenantId,productId,q,ct);
 [HttpGet("choices")] public Task<object> Choices(Guid tenantId,CancellationToken ct,string kind,string? search=null,Guid? warehouseId=null,Guid? zoneId=null,Guid? rackId=null,int page=1)=>service.Choices(tenantId,kind,search,warehouseId,zoneId,rackId,page,ct);
 [HttpGet("export"),EnableRateLimiting("stock-overview-export")]
 public async Task<IActionResult> Export(Guid tenantId,[FromQuery]StockOverviewQuery q,CancellationToken ct,string format="xlsx")
 {var result=await service.Export(tenantId,q,format,ct);return File(result.stream,result.contentType,result.filename);}
}
