using System.Security.Claims;
using IebleWms.Api.Permissions;
using IebleWms.Api.Reports;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/dashboard"),Authorize(Policy="TenantMember"),Authorize(Policy="Permission:dashboard:read")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class DashboardController(DashboardService dashboard,TenantPermissionService permissions):ControllerBase
{
 [HttpGet] public async Task<object> Read(Guid tenantId,CancellationToken ct,int days=7)
 {

  return await dashboard.Read(tenantId,await permissions.EffectiveForUserAsync(tenantId,Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),ct),days,ct);
 }
 [HttpGet("warehouses"), Authorize(Policy="Permission:warehouses:read"), Authorize(Policy="Permission:stock-overview:read")]
 public async Task<object> Warehouses(Guid tenantId,[FromServices] WarehouseDashboardService service,CancellationToken ct,bool compact=false)
  => await service.Warehouses(tenantId,ct,compact);
 [HttpGet("warehouses/{warehouseId:guid}"), Authorize(Policy="Permission:warehouses:read"), Authorize(Policy="Permission:stock-overview:read")]
 public async Task<object> Warehouse(Guid tenantId,Guid warehouseId,[FromServices] WarehouseDashboardService service,CancellationToken ct,Guid? rackId=null,Guid? locationId=null,int page=1,int riskPage=1,int expiryPage=1,string? riskKind=null,int alertPage=1)
 {

  return await service.Read(tenantId,warehouseId,rackId,locationId,page,ct,await permissions.EffectiveForUserAsync(tenantId,Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),ct),riskPage,expiryPage,riskKind,alertPage);
 }
 [HttpGet("warehouses/{warehouseId:guid}/scheduled-receipts"), Authorize(Policy="Permission:warehouses:read"), Authorize(Policy="Permission:stock-overview:read"), Authorize(Policy="Permission:receipts:read")]
 public Task<object> ScheduledReceipts(Guid tenantId,Guid warehouseId,[FromServices] WarehouseDashboardService service,CancellationToken ct,int page=1)=>service.Scheduled(tenantId,warehouseId,false,page,ct);
 [HttpGet("warehouses/{warehouseId:guid}/scheduled-shipments"), Authorize(Policy="Permission:warehouses:read"), Authorize(Policy="Permission:stock-overview:read"), Authorize(Policy="Permission:shipments:read")]
 public Task<object> ScheduledShipments(Guid tenantId,Guid warehouseId,[FromServices] WarehouseDashboardService service,CancellationToken ct,int page=1)=>service.Scheduled(tenantId,warehouseId,true,page,ct);
}
