using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class StockMapBrowserFactAttribute:FactAttribute
{
 public StockMapBrowserFactAttribute(){if(Environment.GetEnvironmentVariable("WMS_STOCK_MAP_BROWSER")!="1")Skip="Opt-in isolated stock map browser QA";}
}
public sealed partial class WarehouseWorkspaceTests
{
 private static async Task<(Guid Warehouse,Guid Rack,Guid Other)> StockMapFixture(AuthFactory f,HttpClient c,Fixture t)
 {
  var ids=await ReadStructureFixture(f,c,t);
  using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
  var p=new Product{TenantId=t.Tenant,Code="MAP-SECOND",NormalizedCode="MAP-SECOND",Name="도면 추적 상품",CreationRequestId=Guid.NewGuid(),Unit="EA",SafetyStock=5};db.Add(p);
  var loc=await db.StorageLocations.SingleAsync(x=>x.RackId==ids.Rack&&x.Level==1&&x.Bay==2);
  for(int i=0;i<21;i++)db.Add(new StockBalance{TenantId=t.Tenant,ProductId=p.Id,WarehouseId=ids.Warehouse,LocationId=loc.Id,Unit="EA",Quantity=1,LotNumber=$"LOT-{i:D2}",SerialNumber=$"SN-{i:D2}",SourceKey=$"map-{i}"});
  var other=new Warehouse{TenantId=t.Tenant,Code="WH02",CustomCode="SECOND-CODE",NormalizedCustomCode="SECOND-CODE",Name="보조 창고"};db.Add(other);
  var roles=PermissionCatalog.Defaults();roles["Employee"]["dashboard"]=[];roles["Employee"]["warehouses"]=["menu","read"];roles["Employee"]["stock-overview"]=["menu","read"];
  var actor=await db.TenantMemberships.Where(x=>x.TenantId==t.Tenant&&x.Role==TenantRole.Master).Select(x=>x.UserId).SingleAsync();
  db.Add(new TenantPermissionSettings{TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(roles),UpdatedByUserId=actor});await db.SaveChangesAsync();
  return(ids.Warehouse,ids.Rack,other.Id);
 }
 [Fact] public async Task StockMapSharesLedgerAndEnforcesInventoryWarehouseAndTenantPermissions()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var ids=await StockMapFixture(f,c,t);await Login(c,t,"Employee");
  var root=$"/api/tenants/{t.Tenant}/reports/stock-overview";var map=root+"/warehouses/"+ids.Warehouse;
  Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Tenant}/dashboard/warehouses")).StatusCode);
  var snapshot=await c.GetFromJsonAsync<JsonElement>(map+"?rackId="+ids.Rack);
  Assert.Equal(63.5m,snapshot.GetProperty("rackTotals")[0].GetProperty("quantity").GetDecimal());
  Assert.Equal(JsonValueKind.Null,snapshot.GetProperty("risk").GetProperty("todayReceipts").ValueKind);
  for(int page=1;page<=2;page++){
   var m=await c.GetFromJsonAsync<JsonElement>(map+$"?rackId={ids.Rack}&page={page}");var stock=m.GetProperty("detail").GetProperty("stock");Assert.Equal(22,stock.GetProperty("total").GetInt32());
   var list=await c.GetFromJsonAsync<JsonElement>(root+$"?view=location&warehouseId={ids.Warehouse}&rackId={ids.Rack}&pageSize=100");
   foreach(var row in stock.GetProperty("items").EnumerateArray()){
    var match=list.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("locationId").ToString()==row.GetProperty("locationId").ToString()&&x.GetProperty("productId").ToString()==row.GetProperty("productId").ToString()&&x.GetProperty("lotNumber").ToString()==row.GetProperty("lotNumber").ToString());
    foreach(var field in new[]{"quantity","reservedQuantity","availableQuantity","serialNumber","unit"})Assert.Equal(match.GetProperty(field).ToString(),row.GetProperty(field).ToString());
   }
  }
  Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Foreign}/reports/stock-overview/warehouses/{ids.Warehouse}")).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/warehouses/"+Guid.NewGuid())).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(map+"?rackId="+Guid.NewGuid())).StatusCode);
  foreach(var feature in new[]{"warehouses","stock-overview"}){
   using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"][feature]=[];var setting=await db.TenantPermissionSettings.SingleAsync();setting.RolesJson=JsonSerializer.Serialize(roles);await db.SaveChangesAsync();}
   Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/warehouses")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(map)).StatusCode);
  }
  using var final=f.Services.CreateScope();var saved=final.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(22,await saved.StockBalances.CountAsync());Assert.Equal(63.5,(await saved.StockBalances.ToListAsync()).Sum(x=>(double)x.Quantity));
 }
 [StockMapBrowserFact] public async Task StockMapRealBrowserUsesReadOnlyIsolatedInventory()
 {
  using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
  var t=await Seed(f);await Login(c,t);var ids=await StockMapFixture(f,c,t);
  var info=new ProcessStartInfo("node","tests/stock-map.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
  info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_STOCK_MAP_UI_ORIGIN")??"http://127.0.0.1:5176";
  using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,warehouse=ids.Warehouse,rack=ids.Rack,other=ids.Other}));process.StandardInput.Close();
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
  Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
  using var final=f.Services.CreateScope();var saved=final.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(22,await saved.StockBalances.CountAsync());Assert.Equal(63.5,(await saved.StockBalances.ToListAsync()).Sum(x=>(double)x.Quantity));Assert.Equal(3,await saved.WarehouseRacks.CountAsync());
 }
}
