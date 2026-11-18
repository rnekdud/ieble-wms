using System.Net;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using IebleWms.Api.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class DashboardTests
{
 [Fact] public async Task RiskForecastReservationsSplitRacksExpiryAndScheduledDocuments(){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await WarehouseRiskScenario.Run(c,$"/api/tenants/{t.Tenant}",f.Services);}
 [Theory][InlineData(39.999,"danger")][InlineData(40,"warning")][InlineData(44,"warning")][InlineData(44.001,"safe")]
 public void RiskTenPercentBoundary(decimal quantity,string expected)=>Assert.Equal(expected,InventoryRiskPolicy.Stock(quantity,40));
 [Fact] public void UnknownAndZeroSafetyAreNotFalseShortages(){Assert.Equal("review",InventoryRiskPolicy.Stock(0,null));Assert.Equal("safe",InventoryRiskPolicy.Stock(0,0));Assert.Equal("review",InventoryRiskPolicy.Stock(50,40,false));Assert.Equal("danger",InventoryRiskPolicy.Highest(["safe","review","warning","danger"]));Assert.Equal("empty",InventoryRiskPolicy.Highest([]));}
 [Fact] public async Task RiskSchedulesUseKstDateAndWithholdUnauthorizedOperations(){
  using var f=new AuthFactory(clock:new FixedClock());using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var root=Dashboard(t)+"/warehouses/"+s.Warehouse;
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var n=0;foreach(var status in new[]{"Planned","Inspecting","Cancelled","Confirmed"})foreach(var day in new[]{30,31})db.InboundReceipts.Add(new(){TenantId=t.Tenant,Number="RISK-"+n++,PartnerId=s.Partner,WarehouseId=s.Warehouse,Status=status,ExpectedDate=new(2026,10,day),RequestId=Guid.NewGuid()});foreach(var status in new[]{"Requested","Picking","Picked","Inspected","Confirmed","Cancelled"})foreach(var day in new[]{30,31})db.OutboundShipments.Add(new(){TenantId=t.Tenant,Number="RISK-"+n++,PartnerId=s.Partner,WarehouseId=s.Warehouse,Status=status,ExpectedDate=new(2026,10,day),RequestId=Guid.NewGuid()});await db.SaveChangesAsync();}
  var risk=(await Get(c,root)).GetProperty("risk");Assert.Equal("2026-10-31",risk.GetProperty("today").GetString());Assert.Equal(2,risk.GetProperty("todayReceipts").GetInt32());Assert.Equal(4,risk.GetProperty("todayShipments").GetInt32());Assert.Equal(2,(await Get(c,root+"/scheduled-receipts")).GetProperty("total").GetInt32());Assert.Equal(4,(await Get(c,root+"/scheduled-shipments")).GetProperty("total").GetInt32());
  var roles=PermissionCatalog.Defaults();roles["Employee"]["receipts"]=[];roles["Employee"]["shipments"]=[];
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(roles),UpdatedByUserId=t.Actor});await db.SaveChangesAsync();}
  using var reader=f.Client();await Login(reader,t,"Reader");var hidden=(await Get(reader,root)).GetProperty("risk");Assert.Equal(JsonValueKind.Null,hidden.GetProperty("todayReceipts").ValueKind);Assert.Equal(JsonValueKind.Null,hidden.GetProperty("todayShipments").ValueKind);Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(root+"/scheduled-receipts")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(root+"/scheduled-shipments")).StatusCode);
  using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(root+"/scheduled-receipts")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/tenants/{t.Other}/dashboard/warehouses/{s.Warehouse}")).StatusCode);
 }
 [Fact] public async Task RiskHoverGroupsCountDistinctProductsAndBoundEachStatus(){
  using var f=new AuthFactory(clock:new FixedClock());using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var rack=await Post(c,$"/api/tenants/{t.Tenant}/warehouses/{s.Warehouse}/racks",new{code="HOVER",name="Hover",levels=1,bays=1});
  var front=await Get(c,$"/api/tenants/{t.Tenant}/warehouses/{s.Warehouse}/racks/{Id(rack)}/front");var loc=Id(front.GetProperty("locations")[0].GetProperty("location"));
  using(var scope=f.Services.CreateScope()) { var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
   for(int i=0;i<13;i++) {var p=new Product{TenantId=t.Tenant,Code=$"HOVER-{i:00}",NormalizedCode=$"HOVER-{i:00}",Name=$"상품 {i}",Unit="EA",SafetyStock=i<8?30:0,ExpiryManaged=true,CreationRequestId=Guid.NewGuid()};db.Add(p);
    for(int lot=0;lot<2;lot++)db.Add(new StockBalance{TenantId=t.Tenant,ProductId=p.Id,WarehouseId=s.Warehouse,LocationId=loc,Unit="EA",Quantity=1,LotNumber=$"LOT-{lot}",ExpiryDate=i>=8&&i<12?new DateOnly(2026,11,7):new DateOnly(2028,1,1),SourceKey=$"hover-{i}-{lot}"});
   }await db.SaveChangesAsync();
  }
  var endpoint=Dashboard(t)+"/warehouses/"+s.Warehouse;
  var groups=(await Get(c,endpoint)).GetProperty("risk").GetProperty("racks").EnumerateArray().Single(x=>Id(x)==Id(rack)).GetProperty("hoverGroups");
  Assert.Equal(8,groups[0].GetProperty("total").GetInt32());Assert.Equal(4,groups[1].GetProperty("total").GetInt32());
  foreach(var g in groups.EnumerateArray()){Assert.Equal(3,g.GetProperty("products").GetArrayLength());Assert.Equal(3,g.GetProperty("products").EnumerateArray().Select(x=>x.GetProperty("productId").GetGuid()).Distinct().Count());}
  using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(endpoint)).StatusCode);
 }

}
