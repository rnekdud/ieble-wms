using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using IebleWms.Api.Receiving;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using IebleWms.Api.Reports;
using Microsoft.Extensions.Options;
using System.IO.Compression;
using System.Xml.Linq;
using System.Text;
namespace IebleWms.Api.Tests;

public sealed partial class DashboardTests
{
    record Fixture(Guid Tenant,Guid Other,Guid Actor,string Password) {public string Root=>$"/api/tenants/{Tenant}/receipts";}
    static async Task<Fixture> Seed(AuthFactory f)
    {
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var users=s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var a=new Tenant{Code="PRODUCT",Name="거래처 기업",BillingStatus=TenantBillingStatus.Paid};var b=new Tenant{Code="OTHER",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};
        var password="Test1!"+Guid.NewGuid().ToString("N");Guid actor=default;
        foreach(var (name,tenant,role) in new[]{("Master",a,TenantRole.Master),("Reader",a,TenantRole.Employee),("Other",b,TenantRole.Master)})
        {var u=new ApplicationUser{UserName=name,Email=name+"@partners.test",DisplayName=name};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.Add(new TenantMembership{Tenant=tenant,User=u,Role=role});if(name=="Master")actor=u.Id;}
        await db.SaveChangesAsync();return new(a.Id,b.Id,actor,password);
    }
    static async Task Login(HttpClient c,Fixture f,string user="Master")=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=user,password=f.Password})).StatusCode);
    static async Task<JsonElement> Post(HttpClient c,string path,object body,HttpStatusCode expected=HttpStatusCode.Created)
    {var r=await AuthTests.Post(c,path,body);Assert.True(r.StatusCode==expected,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
    static Guid Id(JsonElement p)=>p.GetProperty("id").GetGuid();
    static Guid Version(JsonElement p)=>p.GetProperty("version").GetGuid();
    record Structure(Guid Warehouse,Guid Partner,Guid Bulk,Guid Serial,Guid Location,Guid OtherLocation);
    static async Task<Structure> Setup(AuthFactory f,Fixture t)
    {
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var w=new Warehouse{TenantId=t.Tenant,Code="WH-1",Name="창고"};var other=new Warehouse{TenantId=t.Other,Code="WH-1",Name="다른 창고"};
        var partner=new Partner{TenantId=t.Tenant,Code="SUP",NormalizedCode="SUP",Name="매입처",Type="BOTH",CreationRequestId=Guid.NewGuid()};
        var p=new Product{TenantId=t.Tenant,Code="BULK",NormalizedCode="BULK",Name="중량 상품",Unit="kg",CreationRequestId=Guid.NewGuid()};
        var serial=new Product{TenantId=t.Tenant,Code="SERIAL",NormalizedCode="SERIAL",Name="추적 상품",Unit="EA",LotManaged=true,ExpiryManaged=true,SerialManaged=true,CreationRequestId=Guid.NewGuid()};
        var loc=new StorageLocation{TenantId=t.Tenant,WarehouseId=w.Id,Code="FLOOR-1",Name="바닥 위치"};var otherLoc=new StorageLocation{TenantId=t.Other,WarehouseId=other.Id,Code="FLOOR-1",Name="다른 위치"};
        db.AddRange(w,other,partner,p,serial,loc,otherLoc);await db.SaveChangesAsync();return new(w.Id,partner.Id,p.Id,serial.Id,loc.Id,otherLoc.Id);
    }
    static ReceiptRequest Request(Structure s,bool serial=false)=>new(){RequestId=Guid.NewGuid(),ExpectedDate=new DateOnly(2026,11,1),WarehouseId=s.Warehouse,PartnerId=s.Partner,ContactName="검수 담당",Lines=serial?[new(){ProductId=s.Serial,ExpectedQuantity=2,LotNumber="LOT-A",ExpiryDate=new DateOnly(2027,1,1),Serials=["SN-1","SN-2"]}]:[new(){ProductId=s.Bulk,ExpectedQuantity=10.5m}]};
    static JsonElement Doc(JsonElement d)=>d.GetProperty("receipt");
    static JsonElement Line(JsonElement d)=>d.GetProperty("lines")[0];
    static async Task<JsonElement> Ready(HttpClient c,Fixture t,Structure s,bool serial=false)
    {
        var d=await Post(c,t.Root,Request(s,serial));var id=Id(Doc(d));d=await Post(c,t.Root+"/"+id+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
        d=await Post(c,t.Root+"/"+id+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),quantity=serial?2m:9.25m,lotNumber=serial?"LOT-B":null,expiryDate=serial?new DateOnly(2027,2,1):(DateOnly?)null,serials=serial?new[]{"SN-1","SN-2"}:Array.Empty<string>()}}},HttpStatusCode.OK);
        return await Post(c,t.Root+"/"+id+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=s.Location,quantity=serial?2m:9.25m,serials=serial?new[]{"SN-1","SN-2"}:Array.Empty<string>()}}}}},HttpStatusCode.OK);
    }
    static string Root(Fixture t)=>$"/api/tenants/{t.Tenant}/shipments";
    static JsonElement Shipment(JsonElement d)=>d.GetProperty("shipment");
    static ShipmentRequest OutRequest(Structure s,decimal qty=3,bool serial=false)=>new(){RequestId=Guid.NewGuid(),RequestDate=new(2026,11,1),ExpectedDate=new(2026,11,2),WarehouseId=s.Warehouse,PartnerId=s.Partner,ContactName="출고 담당",Lines=[new(){ProductId=serial?s.Serial:s.Bulk,RequestedQuantity=qty}]};
    static async Task Receive(HttpClient c,Fixture t,Structure s,bool serial=false){var d=await Ready(c,t,s,serial);await Post(c,t.Root+"/"+Id(Doc(d))+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);}
    static async Task<JsonElement> Action(HttpClient c,Fixture t,JsonElement d,string action)=>await Post(c,Root(t)+"/"+Id(Shipment(d))+"/"+action,new{version=Version(Shipment(d))},HttpStatusCode.OK);
    static object WorkBody(JsonElement d,bool complete=true,decimal? quantity=null)=>new{version=Version(Shipment(d)),complete,allocations=d.GetProperty("allocations").EnumerateArray().Select(a=>new{allocationId=Id(a),quantity=quantity??a.GetProperty("quantity").GetDecimal()}).ToArray()};
    static async Task<JsonElement> Work(HttpClient c,Fixture t,JsonElement d,string action,bool complete=true,decimal? qty=null)=>await Post(c,Root(t)+"/"+Id(Shipment(d))+"/"+action,WorkBody(d,complete,qty),HttpStatusCode.OK);
    static string Inventory(Fixture t)=>$"/api/tenants/{t.Tenant}/inventory";
    static async Task<JsonElement> Stock(HttpClient c,Fixture t,Guid product)=> (await c.GetFromJsonAsync<JsonElement>(Inventory(t)+"?productId="+product)).GetProperty("items")[0];
    static InventoryRequest Input(JsonElement stock,decimal qty=1)=>new(){RequestId=Guid.NewGuid(),StockId=Id(stock),Version=Version(stock),Quantity=qty,OccurredAt=DateTimeOffset.UtcNow,Reason="검증"};
    static JsonElement Operation(JsonElement d)=>d.GetProperty("operation");
    static async Task<(Guid warehouse,Guid location)> Target(AuthFactory f,Fixture t,Structure s,bool cross=false)
    {
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var w=s.Warehouse;
        if(cross){var target=new Warehouse{TenantId=t.Tenant,Code="DEST",Name="도착 창고"};db.Add(target);w=target.Id;}
        var loc=new StorageLocation{TenantId=t.Tenant,WarehouseId=w,Code="DEST-LOC",Name="도착 위치"};db.Add(loc);await db.SaveChangesAsync();return(w,loc.Id);
    }
 static string Dashboard(Fixture t)=>$"/api/tenants/{t.Tenant}/dashboard";
 static async Task<JsonElement> Get(HttpClient c,string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
 [Fact] public async Task ActualWorkflowsReservationDocumentsReportsAgreeAndNeverMutateData()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Products.SingleAsync(x=>x.Id==s.Bulk)).SafetyStock=10;db.Warehouses.Add(new(){TenantId=t.Tenant,Code="OFF",Name="미사용",IsActive=false});await db.SaveChangesAsync();}
  var request=OutRequest(s,2);request.Lines=[new(){ProductId=s.Bulk,RequestedQuantity=1},new(){ProductId=s.Bulk,RequestedQuantity=1}];await Post(c,Root(t),request);
  var shipped=await Post(c,Root(t),OutRequest(s,1));shipped=await Action(c,t,shipped,"start-picking");shipped=await Work(c,t,shipped,"picking");shipped=await Work(c,t,shipped,"inspection");await Action(c,t,shipped,"confirm");
  await Post(c,t.Root,Request(s));await Ready(c,t,s);
  using var state=f.Services.CreateScope();var dbState=state.ServiceProvider.GetRequiredService<WmsDbContext>();var before=await dbState.StockBalances.AsNoTracking().ToListAsync();var count=await dbState.StockMovements.CountAsync();var result=await Get(c,Dashboard(t));var m=result.GetProperty("metrics");
  Assert.Equal(2,m.GetProperty("activeProducts").GetInt32());Assert.Equal(1,m.GetProperty("activeWarehouses").GetInt32());Assert.Equal(1,m.GetProperty("lowProducts").GetInt32());Assert.Equal(2,m.GetProperty("openReceipts").GetInt32());Assert.Equal(1,m.GetProperty("openShipments").GetInt32());Assert.Equal(1,m.GetProperty("reservedShipments").GetInt32());
  var stock=result.GetProperty("lowItems")[0];Assert.Equal(8.25m,stock.GetProperty("quantity").GetDecimal());Assert.Equal(2,stock.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(6.25m,stock.GetProperty("availableQuantity").GetDecimal());
  var overview=await Get(c,$"/api/tenants/{t.Tenant}/reports/stock-overview?status=low");Assert.Equal(overview.GetProperty("summary").GetProperty("lowProducts").GetInt32(),m.GetProperty("lowProducts").GetInt32());
  foreach(var days in new[]{7,30}){var r=await Get(c,Dashboard(t)+"?days="+days);var end=DateOnly.Parse(r.GetProperty("today").GetString()!);var stats=await Get(c,$"/api/tenants/{t.Tenant}/reports/movement-stats?start={end.AddDays(1-days):yyyy-MM-dd}&end={end:yyyy-MM-dd}&bucket=day");Assert.Equal(stats.GetProperty("trend").ToString(),r.GetProperty("trend").ToString());Assert.Equal(days,r.GetProperty("trend").GetArrayLength());}
  Assert.Equal(1,result.GetProperty("todayReceipts").GetProperty("confirmed").GetInt32());Assert.Equal(1,result.GetProperty("todayShipments").GetProperty("confirmed").GetInt32());Assert.Equal(5,result.GetProperty("recent").GetArrayLength());
  var after=await dbState.StockBalances.AsNoTracking().ToListAsync();Assert.Equal(count,await dbState.StockMovements.CountAsync());Assert.All(before,x=>Assert.Contains(after,y=>y.Id==x.Id&&y.Version==x.Version&&y.Quantity==x.Quantity&&y.ReservedQuantity==x.ReservedQuantity));
 }
 [Fact] public async Task EmptyTenantAndFeatureGrantsDoNotLeakUnauthorizedAggregates()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var empty=await Get(c,Dashboard(t));Assert.All(empty.GetProperty("metrics").EnumerateObject(),x=>Assert.Equal(0,x.Value.GetInt32()));Assert.Empty(empty.GetProperty("recent").EnumerateArray());Assert.Equal(7,empty.GetProperty("trend").GetArrayLength());
  var s=await Setup(f,t);await Receive(c,t,s);using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(Dashboard(t))).StatusCode);Assert.Equal(0,(await Get(other,$"/api/tenants/{t.Other}/dashboard")).GetProperty("metrics").GetProperty("activeProducts").GetInt32());
  var roles=PermissionCatalog.Defaults();foreach(var key in roles["Employee"].Keys.ToArray())roles["Employee"][key]=[];roles["Employee"]["dashboard"]=["menu","read"];
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(roles),UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid()});await db.SaveChangesAsync();}
  using var reader=f.Client();await Login(reader,t,"Reader");var hidden=await Get(reader,Dashboard(t));Assert.All(hidden.GetProperty("metrics").EnumerateObject(),x=>Assert.Equal(JsonValueKind.Null,x.Value.ValueKind));foreach(var field in new[]{"trend","recent","todayReceipts","todayShipments","lowItems","expiryItems"})Assert.Equal(JsonValueKind.Null,hidden.GetProperty(field).ValueKind);
  roles["Employee"]["movement-stats"]=["menu","read"];roles["Employee"]["shipments"]=["menu","read"];
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.TenantPermissionSettings.SingleAsync()).RolesJson=JsonSerializer.Serialize(roles);await db.SaveChangesAsync();}
  hidden=await Get(reader,Dashboard(t));Assert.Null(hidden.GetProperty("todayReceipts").Deserialize<object>());Assert.All(hidden.GetProperty("trend").EnumerateArray(),x=>Assert.Equal(JsonValueKind.Null,x.GetProperty("receipts").ValueKind));Assert.Empty(hidden.GetProperty("recent").EnumerateArray());
  roles["Employee"]["dashboard"]=[];using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.TenantPermissionSettings.SingleAsync()).RolesJson=JsonSerializer.Serialize(roles);await db.SaveChangesAsync();}Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(Dashboard(t))).StatusCode);
  using var anonymous=f.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(Dashboard(t))).StatusCode);Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(Dashboard(t)+"?days=365")).StatusCode);
 }
 [Fact] public async Task WarehouseMapSharedLedgerActualLocationAndReservationRefresh()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
  await WarehouseDashboardScenario.Run(c,$"/api/tenants/{t.Tenant}",f.Services);
 }
 [Fact] public async Task WarehouseMapRequiresWarehouseStockDashboardAndTenantPermissions()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var root=Dashboard(t)+"/warehouses";
  using var anonymous=f.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(root)).StatusCode);
  using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(root)).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/"+Guid.NewGuid())).StatusCode);
  Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(root+"/"+s.Warehouse+"?page=0")).StatusCode);
  Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(root+"/"+s.Warehouse+"?locationId="+s.Location)).StatusCode);
  using var reader=f.Client();await Login(reader,t,"Reader");
  foreach(var feature in new[]{"dashboard","warehouses","stock-overview"}) {
   using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"][feature]=[];
    var settings=await db.TenantPermissionSettings.SingleOrDefaultAsync();if(settings==null){settings=new(){TenantId=t.Tenant,UpdatedByUserId=t.Actor};db.Add(settings);}settings.RolesJson=JsonSerializer.Serialize(roles);await db.SaveChangesAsync();}
   Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(root)).StatusCode);
   Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(root+"/"+s.Warehouse)).StatusCode);
  }
 }
 sealed class FixedClock:TimeProvider {public override DateTimeOffset GetUtcNow()=>DateTimeOffset.Parse("2026-10-30T18:00:00Z");}
 [Fact] public async Task KstMidnightConfirmedDateNotCreatedDateAndOpenStatuses()
 {
  using var f=new AuthFactory(clock:new FixedClock());using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();int n=0;
   foreach(var date in new[]{"2026-10-30T14:59:59Z","2026-10-30T15:00:00Z","2026-10-31T14:59:59Z","2026-10-31T15:00:00Z"}){var d=new InboundReceipt{TenantId=t.Tenant,Number="BOUND-"+n++,PartnerId=s.Partner,WarehouseId=s.Warehouse,Status="Confirmed",ConfirmedAt=DateTimeOffset.Parse(date),ConfirmedByUserId=t.Actor,ExpectedDate=new(2026,10,1),RequestId=Guid.NewGuid()};db.Add(d);for(int i=0;i<2;i++)db.Add(new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=d.Id,ProductId=s.Bulk,Position=i,Unit="kg",ExpectedQuantity=1,InspectedQuantity=1});}
   foreach(var status in new[]{"Planned","Inspecting","Cancelled"})db.Add(new InboundReceipt{TenantId=t.Tenant,Number=status,PartnerId=s.Partner,WarehouseId=s.Warehouse,ExpectedDate=new(2026,10,31),Status=status,RequestId=Guid.NewGuid()});
   foreach(var status in new[]{"Requested","Picking","Picked","Inspected","Cancelled"})db.Add(new OutboundShipment{TenantId=t.Tenant,Number=status,PartnerId=s.Partner,WarehouseId=s.Warehouse,RequestDate=new(2026,10,31),ExpectedDate=new(2026,10,31),Status=status,RequestId=Guid.NewGuid()});await db.SaveChangesAsync();}
  var r=await Get(c,Dashboard(t));Assert.Equal("2026-10-31",r.GetProperty("today").GetString());var today=r.GetProperty("todayReceipts");Assert.Equal(2,today.GetProperty("confirmed").GetInt32());Assert.Equal(2,today.GetProperty("scheduled").GetInt32());Assert.Equal(1,today.GetProperty("working").GetInt32());today=r.GetProperty("todayShipments");Assert.Equal(4,today.GetProperty("scheduled").GetInt32());Assert.Equal(3,today.GetProperty("working").GetInt32());Assert.Equal(3,r.GetProperty("trend").EnumerateArray().Sum(x=>x.GetProperty("receipts").GetInt32()));Assert.Equal(10,r.GetProperty("recent").GetArrayLength());
 }
 [Fact] public async Task SafetyBoundaryAndExpiryUseExistingOverviewRulesAndPreserveUnits()
 {
  using var f=new AuthFactory(clock:new FixedClock());using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
   for(int i=0;i<8;i++){var p=new Product{TenantId=t.Tenant,Code="LOW-"+i,NormalizedCode="LOW-"+i,Name="부족",Unit=i%2==0?"EA":"kg",SafetyStock=5,CreationRequestId=Guid.NewGuid()};db.Add(p);}
   var equal=new Product{TenantId=t.Tenant,Code="EQUAL",NormalizedCode="EQUAL",Name="경계",Unit="kg",SafetyStock=5,CreationRequestId=Guid.NewGuid()};db.AddRange(equal,new StockBalance{TenantId=t.Tenant,ProductId=equal.Id,WarehouseId=s.Warehouse,LocationId=s.Location,Unit="kg",Quantity=5,SourceKey="equal"});
   int n=0;foreach(var (days,managed,qty) in new[]{(-1,true,2),(0,true,2),(30,true,2),(31,true,2),(-1,false,2),(-1,true,0)}){var p=new Product{TenantId=t.Tenant,Code="EXP-"+n,NormalizedCode="EXP-"+n,Name="유통기한",Unit="EA",ExpiryManaged=managed,CreationRequestId=Guid.NewGuid()};db.AddRange(p,new StockBalance{TenantId=t.Tenant,ProductId=p.Id,WarehouseId=s.Warehouse,LocationId=s.Location,Unit="EA",Quantity=qty,ExpiryDate=new DateOnly(2026,10,31).AddDays(days),SourceKey="expiry-"+n++});}await db.SaveChangesAsync();}
  var r=await Get(c,Dashboard(t));Assert.Equal(8,r.GetProperty("metrics").GetProperty("lowProducts").GetInt32());Assert.Equal(5,r.GetProperty("lowItems").GetArrayLength());Assert.Equal(4,r.GetProperty("expiryCount").GetInt32());Assert.Equal(new[]{-1,-1,0,30},r.GetProperty("expiryItems").EnumerateArray().Select(x=>x.GetProperty("remainingDays").GetInt32()).ToArray());Assert.DoesNotContain(r.GetProperty("lowItems").EnumerateArray(),x=>x.GetProperty("productCode").GetString()=="EQUAL");
 }
}
