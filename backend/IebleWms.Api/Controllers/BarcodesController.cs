using System.Text.Json;
using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using IebleWms.Api.Reports;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Controllers;
[ApiController,Route("api/tenants/{tenantId:guid}/barcodes"),Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
public sealed class BarcodesController(WmsDbContext db,InternalBarcodeCandidates candidates,IAuthorizationService authorization,WarehousePlanService plans,StockOverviewService stock):ControllerBase
{
 async Task<bool> Allowed(string area,string action="read")=>(await authorization.AuthorizeAsync(User,null,$"Permission:{area}:{action}")).Succeeded;
 static OrganizationException Missing()=>new(404,"조회 가능한 바코드 등록 대상을 찾을 수 없습니다.");
 // Availability is scoped to the tenant registry; conflict details require separate read permission.
 [HttpGet("check")]
 public async Task<IActionResult> Check(Guid tenantId,string value,CancellationToken ct,Guid? productId=null)
 {
  if(!await Allowed("products","create")&&!await Allowed("products","update"))return Forbid();
  if(productId.HasValue){
   if(!await Allowed("products","update"))return Forbid();
   if(!await db.Products.AnyAsync(x=>x.TenantId==tenantId&&x.Id==productId,ct))throw Missing();
  }
  var label=await BarcodeRegistry.Find(db,tenantId,value,ct);
  if(label==null||(productId.HasValue&&label.ProductId==productId))return Ok(new{available=true});
  if(label.ProductId is Guid owner){
   if(!await Allowed("products"))return Ok(new{available=false});
   var p=await db.Products.AsNoTracking().Where(x=>x.TenantId==tenantId&&x.Id==owner).Select(x=>new{x.Id,x.Code,x.Name}).SingleAsync(ct);
   return Ok(new{available=false,conflict=new{kind="product",p.Id,p.Code,p.Name}});
  }
  if(!await Allowed("warehouses"))return Ok(new{available=false});
  var warehouseName=await db.Warehouses.Where(x=>x.TenantId==tenantId&&x.Id==label.WarehouseId).Select(x=>x.Name).SingleAsync(ct);
  if(label.RackId is Guid rackId){
   var r=await db.WarehouseRacks.AsNoTracking().Where(x=>x.TenantId==tenantId&&x.Id==rackId).Select(x=>new{x.Id,x.Code,x.Name}).SingleOrDefaultAsync(ct);
   if(r==null)return Ok(new{available=false});
   return Ok(new{available=false,conflict=new{kind="rack",r.Id,r.Code,r.Name,warehouseName}});
  }
  var l=await db.StorageLocations.AsNoTracking().Where(x=>x.TenantId==tenantId&&x.Id==label.LocationId).Select(x=>new{x.Id,x.Code,x.Name}).SingleOrDefaultAsync(ct);
  if(l==null)return Ok(new{available=false});
  return Ok(new{available=false,conflict=new{kind="location",l.Id,l.Code,l.Name,warehouseName}});
 }
 [HttpPost("candidates")]
 public async Task<IActionResult> Candidate(Guid tenantId,CancellationToken ct,string kind="location")
 {
  if(kind is not ("product" or "rack" or "location"))return BadRequest(new{message="대상 유형을 확인해 주세요."});
  var area=kind=="product"?"products":"warehouses";
  if(!await Allowed(area,"create")&&!await Allowed(area,"update"))return Forbid();
  return Ok(await candidates.Generate(db,tenantId,kind,value=>db.StorageBarcodes.AnyAsync(x=>x.Value==value,ct)));
 }
 [HttpGet("lookup")]
 public async Task<IActionResult> Lookup(Guid tenantId,string value,CancellationToken ct)
 {
  if(!await Allowed("products")&&!await Allowed("warehouses"))return Forbid();
  if(value.Length is <1 or >64||value.Any(c=>c<32||c>126))return BadRequest(new{message="Code 128 입력 형식을 확인해 주세요."});
  var label=await BarcodeRegistry.Find(db,tenantId,value,ct)??throw Missing();
  if(label.ProductId is Guid productId){if(!await Allowed("products"))throw Missing();var item=await db.Products.AsNoTracking().SingleAsync(x=>x.TenantId==tenantId&&x.Id==productId,ct);return Ok(new{kind="product",item,inventoryAvailable=await Allowed("stock-overview")});}
  if(!await Allowed("warehouses"))throw Missing();
  if(label.RackId is Guid rackId)return Ok(new{kind="rack",item=await plans.Rack(tenantId,label.WarehouseId!.Value,rackId,ct,await Allowed("stock-overview"))});
  var location=await db.StorageLocations.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenantId&&x.Id==label.LocationId,ct)??throw Missing();
  var warehouseName=await db.Warehouses.Where(x=>x.TenantId==tenantId&&x.Id==location.WarehouseId).Select(x=>x.Name).SingleAsync(ct);
  var rack=await db.WarehouseRacks.Where(x=>x.TenantId==tenantId&&x.Id==location.RackId).Select(x=>new{x.Code,x.ZoneId}).SingleOrDefaultAsync(ct);
  var zoneName=await db.WarehouseZones.Where(x=>x.TenantId==tenantId&&x.Id==(location.ZoneId??(rack==null?null:rack.ZoneId))).Select(x=>x.Name).SingleOrDefaultAsync(ct);
  return Ok(new{kind="location",item=location,warehouseName,rackCode=rack?.Code,zoneName,inventoryAvailable=await Allowed("stock-overview")});
 }
 [HttpGet("locations/{id:guid}/stock"),Authorize(Policy="Permission:warehouses:read"),Authorize(Policy="Permission:stock-overview:read")]
 public async Task<object> LocationStock(Guid tenantId,Guid id,CancellationToken ct,int page=1)
 {
  var l=await db.StorageLocations.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenantId&&x.Id==id,ct)??throw Missing();
  return await stock.List(tenantId,new StockOverviewQuery{View="location",WarehouseId=l.WarehouseId,LocationId=l.Id,Page=page,PageSize=20},ct);
 }
 [HttpGet("{kind}/{id:guid}/history")]
 public async Task<IActionResult> History(Guid tenantId,string kind,Guid id,CancellationToken ct)
 {
  if(kind is not ("product" or "rack" or "location"))return NotFound();
  if(!await Allowed(kind=="product"?"products":"warehouses"))return Forbid();
  if(kind=="product"){
   if(!await db.Products.AnyAsync(x=>x.TenantId==tenantId&&x.Id==id,ct))throw Missing();
   var rows=await (from h in db.ProductChanges where h.TenantId==tenantId&&h.TargetId==id join u in db.Users on h.ChangedByUserId equals u.Id orderby h.Id descending select new{h.Id,h.BeforeJson,h.AfterJson,h.ChangedAt,actor=u.DisplayName}).Take(100).ToListAsync(ct);
   return Ok(rows.Select(x=>new{x.Id,before=Value(x.BeforeJson,"Barcode"),after=Value(x.AfterJson,"Barcode"),x.ChangedAt,x.actor}).Where(x=>x.before!=x.after).Take(50));
  }
  var exists=kind=="rack"?await db.WarehouseRacks.AnyAsync(x=>x.TenantId==tenantId&&x.Id==id,ct):await db.StorageLocations.AnyAsync(x=>x.TenantId==tenantId&&x.Id==id,ct);if(!exists)throw Missing();
  return Ok(await (from h in db.WarehouseChanges where h.TenantId==tenantId&&h.TargetId==id&&h.Action==(kind=="rack"?"RackBarcodeChanged":"LocationBarcodeChanged") join u in db.Users on h.ChangedByUserId equals u.Id orderby h.Id descending select new{h.Id,h.BeforeJson,h.AfterJson,h.ChangedAt,actor=u.DisplayName}).Take(50).ToListAsync(ct));
 }
 static string? Value(string json,string key){using var d=JsonDocument.Parse(json);if(d.RootElement.ValueKind==JsonValueKind.Array)return string.Join(" · ",d.RootElement.EnumerateArray().Select(x=>x.TryGetProperty("Value",out var value)?value.GetString():null));return d.RootElement.ValueKind==JsonValueKind.Object&&d.RootElement.TryGetProperty(key,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString():null;}
}
