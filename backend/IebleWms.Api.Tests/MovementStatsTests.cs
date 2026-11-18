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

public sealed class MovementStatsTests
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
 static string Stats(Fixture t)=>$"/api/tenants/{t.Tenant}/reports/movement-stats";
 static async Task<JsonElement> Get(HttpClient c,string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
 static MovementStatsService Service(WmsDbContext db,TimeProvider? clock=null,int max=20000)=>new(db,clock??TimeProvider.System,Options.Create(new StockOverviewOptions{MaxExportRows=max}));
 [Fact] public async Task ConfirmedOnlyDistinctDocumentsActualQuantitiesAndAllViews()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var planned=await Post(c,t.Root,Request(s));await Post(c,t.Root+"/"+Id(Doc(planned))+"/cancel",new{version=Version(Doc(planned))},HttpStatusCode.OK);await Ready(c,t,s);
  var request=Request(s);request.Lines=[new(){ProductId=s.Bulk,ExpectedQuantity=5},new(){ProductId=s.Bulk,ExpectedQuantity=6}];var d=await Post(c,t.Root,request);var doc=Id(Doc(d));d=await Post(c,t.Root+"/"+doc+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
  d=await Post(c,t.Root+"/"+doc+"/inspection",new{version=Version(Doc(d)),lines=d.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),quantity=2.25m,serials=Array.Empty<string>()})},HttpStatusCode.OK);
  d=await Post(c,t.Root+"/"+doc+"/placements",new{version=Version(Doc(d)),lines=d.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),placements=new[]{new{locationId=s.Location,quantity=2.25m,serials=Array.Empty<string>()}}})},HttpStatusCode.OK);
  await Post(c,t.Root+"/"+doc+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  var outdoc=await Post(c,Root(t),OutRequest(s,3));outdoc=await Action(c,t,outdoc,"start-picking");outdoc=await Work(c,t,outdoc,"picking");outdoc=await Work(c,t,outdoc,"inspection");await Action(c,t,outdoc,"confirm");await Post(c,Root(t),OutRequest(s,1));
  var stock=await Stock(c,t,s.Bulk);var adjustment=Input(stock,2);adjustment.Increase=true;await Post(c,Inventory(t)+"/adjust",adjustment);
  foreach(var view in new[]{"product","warehouse","partner","detail"}){var r=await Get(c,Stats(t)+"?view="+view);var summary=r.GetProperty("summary");Assert.Equal(1,summary.GetProperty("receipts").GetInt32());Assert.Equal(1,summary.GetProperty("shipments").GetInt32());Assert.Equal(1,summary.GetProperty("receiptProducts").GetInt32());Assert.Equal(1,summary.GetProperty("shipmentProducts").GetInt32());Assert.Equal(1,r.GetProperty("trend").EnumerateArray().Sum(x=>x.GetProperty("receipts").GetInt32()));if(view=="product"){var row=r.GetProperty("items")[0];Assert.Equal(4.5m,row.GetProperty("receiptQuantity").GetDecimal());Assert.Equal(3,row.GetProperty("shipmentQuantity").GetDecimal());Assert.Equal(1.5m,row.GetProperty("difference").GetDecimal());}if(view=="detail")Assert.Equal(4,r.GetProperty("total").GetInt32());}
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Partners.SingleAsync(x=>x.Id==s.Partner)).IsActive=false;await db.SaveChangesAsync();}
  Assert.Equal(1,(await Get(c,Stats(t)+"?view=partner")).GetProperty("total").GetInt32());
 }
 [Fact] public async Task KstBoundariesZeroFilledDailyWeeklyMonthlyAndCreationDateIgnored()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  // Immutable confirmed fixtures in the isolated DB; no updates to finalized documents.
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();int n=0;
   foreach(var stamp in new[]{"2026-09-30T14:59:59Z","2026-09-30T15:00:00Z","2026-10-01T14:59:59Z","2026-10-01T15:00:00Z","2026-10-31T15:00:00Z"}){
    var doc=new InboundReceipt{TenantId=t.Tenant,Number="BOUND-"+n++,PartnerId=s.Partner,WarehouseId=s.Warehouse,Status="Confirmed",ConfirmedAt=DateTimeOffset.Parse(stamp),ConfirmedByUserId=t.Actor,RequestId=Guid.NewGuid(),ExpectedDate=new(2026,1,1)};
    db.AddRange(doc,new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=doc.Id,ProductId=s.Bulk,Unit="kg",ExpectedQuantity=10,InspectedQuantity=2});
   }await db.SaveChangesAsync();}
  var day=await Get(c,Stats(t)+"?start=2026-10-01&end=2026-10-01");Assert.Equal(2,day.GetProperty("summary").GetProperty("receipts").GetInt32());Assert.Single(day.GetProperty("trend").EnumerateArray());
  foreach(var bucket in new[]{"day","week","month"}){var r=await Get(c,Stats(t)+"?start=2026-10-01&end=2026-10-31&bucket="+bucket);Assert.Equal(3,r.GetProperty("summary").GetProperty("receipts").GetInt32());Assert.Equal(3,r.GetProperty("trend").EnumerateArray().Sum(x=>x.GetProperty("receipts").GetInt32()));Assert.Equal(bucket=="day"?31:bucket=="week"?5:1,r.GetProperty("trend").GetArrayLength());}
 }
 [Fact] public async Task FiltersUnitsWholeResultExportsAndLimits()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var doc=await db.InboundReceipts.SingleAsync();var p=await db.Products.SingleAsync(x=>x.Id==s.Bulk);p.Name="=HYPERLINK(\"unsafe\")";var cat=new ProductCategory{TenantId=t.Tenant,Name="분류"};db.Add(cat);p.CategoryId=cat.Id;for(int i=0;i<24;i++)db.Add(new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=doc.Id,ProductId=p.Id,ProductCode=p.Code,ProductName=p.Name,Position=i+2,Unit="kg",ExpectedQuantity=1,InspectedQuantity=.125m,LotNumber="QA"+i});db.Add(new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=doc.Id,ProductId=p.Id,ProductCode=p.Code,ProductName=p.Name,Position=26,Unit="BOX",ExpectedQuantity=1,InspectedQuantity=1});await db.SaveChangesAsync();}
  var list=await Get(c,Stats(t)+"?view=product");Assert.Equal(2,list.GetProperty("total").GetInt32());Assert.Contains(list.GetProperty("items").EnumerateArray(),r=>r.GetProperty("unit").GetString()=="kg"&&r.GetProperty("receiptQuantity").GetDecimal()==12.25m);var detail=await Get(c,Stats(t)+"?view=detail&page=2");Assert.Equal(26,detail.GetProperty("total").GetInt32());Assert.Equal(6,detail.GetProperty("items").GetArrayLength());Assert.Equal(1,detail.GetProperty("summary").GetProperty("receipts").GetInt32());
  Assert.Equal(0,(await Get(c,Stats(t)+"?direction=shipment")).GetProperty("total").GetInt32());Assert.Equal(0,(await Get(c,Stats(t)+"?warehouseId="+Guid.NewGuid())).GetProperty("total").GetInt32());Assert.Equal(2,(await Get(c,Stats(t)+"?productId="+s.Bulk+"&partnerId="+s.Partner)).GetProperty("total").GetInt32());
  var bytes=await c.GetByteArrayAsync(Stats(t)+"/export?view=detail&page=2&format=csv");Assert.Equal(new byte[]{239,187,191},bytes.Take(3));var csv=Encoding.UTF8.GetString(bytes);Assert.Equal(28,csv.Split('\n').Length);Assert.Contains("'=HYPERLINK",csv);
  foreach(var view in new[]{"product","warehouse","partner","detail"}){var xlsx=await c.GetByteArrayAsync(Stats(t)+"/export?view="+view+"&format=xlsx");using var zip=new ZipArchive(new MemoryStream(xlsx));using var sheet=zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=XDocument.Load(sheet);XNamespace n="http://schemas.openxmlformats.org/spreadsheetml/2006/main";Assert.Empty(xml.Descendants(n+"f"));Assert.True(xml.Descendants(n+"row").Count()>1);}
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var ex=await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>Service(db,max:20).Export(t.Tenant,new(){View="detail"},"csv",default));Assert.Contains("20",ex.Message);}
 }
 [Fact] public async Task TenantPermissionChoicesAndInvalidQueries()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
  foreach(var kind in new[]{"products","categories","warehouses","partners"})Assert.True((await c.GetAsync(Stats(t)+"/choices?kind="+kind)).IsSuccessStatusCode);
  using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(Stats(t))).StatusCode);Assert.Equal(0,(await Get(other,$"/api/tenants/{t.Other}/reports/movement-stats")).GetProperty("total").GetInt32());
  using var reader=f.Client();await Login(reader,t,"Reader");Assert.Equal(HttpStatusCode.OK,(await reader.GetAsync(Stats(t))).StatusCode);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var company=await db.Tenants.SingleAsync(x=>x.Id==t.Tenant);var permissions=PermissionCatalog.Defaults();permissions["Employee"]["movement-stats"]=[];db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(permissions),UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid()});await db.SaveChangesAsync();}
  Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(Stats(t)+"/export?format=csv")).StatusCode);
  using var anonymous=f.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(Stats(t))).StatusCode);
  foreach(var query in new[]{"start=2026-10-02&end=2026-10-01","view=bad","end=0001-01-01","bucket=bad","pageSize=100000","start=1900-01-01&end=2026-10-01"})Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(Stats(t)+"?"+query)).StatusCode);
 }
}
