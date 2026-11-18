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

public sealed class StockHistoryTests
{
    [Fact]
    public async Task UnifiedTrackingSearchKeepsTenantScopeTotalsAndDocumentRows()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var setup=await Setup(f,t);await Login(c,t);await Receive(c,t,setup,true);
        var root=$"/api/tenants/{t.Tenant}";
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var location=await db.StorageLocations.SingleAsync(x=>x.Id==setup.OtherLocation);
            var p=new Product{TenantId=t.Other,Code="HIDDEN",NormalizedCode="HIDDEN",Name="Other tenant",CreationRequestId=Guid.NewGuid()};db.Products.Add(p);
            db.StockBalances.Add(new(){TenantId=t.Other,ProductId=p.Id,WarehouseId=location.WarehouseId,LocationId=location.Id,Unit="EA",SourceKey="OTHER",LotNumber="SECRET-TENANT",SerialNumber="SECRET-SERIAL",Quantity=1});await db.SaveChangesAsync();
        }
        async Task<JsonElement> Read(string url) {var r=await c.GetAsync(url);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
        foreach(var endpoint in new[]{"products","inventory","reports/stock-overview","reports/stock-history","reports/movement-stats"}) {
            var dates=endpoint is "reports/stock-history" or "reports/movement-stats"?"&start=2020-01-01&end=2029-12-31":"";
            foreach(var term in new[]{"LOT-B","sn-1","  LOT-b  "}) {
                var result=await Read(root+"/"+endpoint+"?search="+Uri.EscapeDataString(term)+dates);
                Assert.True(result.GetProperty("total").GetInt32()>0,endpoint+" missing "+term);
                if(endpoint is "products" or "reports/stock-overview")Assert.Equal(1,result.GetProperty("total").GetInt32());
            }
            Assert.Equal(0,(await Read(root+"/"+endpoint+"?search=SECRET-TENANT"+dates)).GetProperty("total").GetInt32());
        }
        var lot=await Read(root+"/reports/stock-overview?search=LOT-B&warehouseId="+setup.Warehouse);
        Assert.Equal(2,lot.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        var serial=await Read(root+"/reports/stock-overview?search=SN-1&warehouseId="+setup.Warehouse);
        Assert.Equal(1,serial.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        Assert.Equal(0,(await Read(root+"/reports/stock-overview?search=LOT-B&warehouseId="+Guid.NewGuid())).GetProperty("total").GetInt32());
        var rows=await Read(root+"/reports/stock-history?search=SN-1&start=2020-01-01&end=2029-12-31");Assert.Equal(1,rows.GetProperty("total").GetInt32());
        using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(root+"/reports/stock-overview?search=LOT-B")).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await context.StockBalances.CountAsync(x=>x.TenantId==t.Tenant));Assert.Equal(2,await context.StockMovements.CountAsync(x=>x.TenantId==t.Tenant));
    }
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
 static string History(Fixture t)=>$"/api/tenants/{t.Tenant}/reports/stock-history";
 static async Task<JsonElement> Get(HttpClient c,string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
 static StockHistoryService Service(WmsDbContext db,int max=20000)=>new(db,TimeProvider.System,Options.Create(new StockOverviewOptions{MaxExportRows=max}));
 [Fact] public async Task ImmutableLedgerAllTypesDocumentDetailsAndReservationExclusion()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Ready(c,t,s);Assert.Equal(0,(await Get(c,History(t))).GetProperty("total").GetInt32());await Receive(c,t,s);
  var before=await Get(c,History(t));Assert.Equal(1,before.GetProperty("total").GetInt32());Assert.Equal(s.Location,before.GetProperty("items")[0].GetProperty("locationId").GetGuid());var shipment=await Post(c,Root(t),OutRequest(s,3));Assert.Equal(1,(await Get(c,History(t))).GetProperty("total").GetInt32());shipment=await Action(c,t,shipment,"start-picking");shipment=await Work(c,t,shipment,"picking");shipment=await Work(c,t,shipment,"inspection");await Action(c,t,shipment,"confirm");
  var target=await Target(f,t,s);var move=Input(await Stock(c,t,s.Bulk),1);move.WarehouseId=target.warehouse;move.LocationId=target.location;var operation=Operation(await Post(c,Inventory(t)+"/move",move));
  var increase=Input(await Stock(c,t,s.Bulk),2);increase.Increase=true;await Post(c,Inventory(t)+"/adjust",increase);var decrease=Input(await Stock(c,t,s.Bulk),1);await Post(c,Inventory(t)+"/adjust",decrease);
  var counts=$"/api/tenants/{t.Tenant}/stocktakes";var d=await Post(c,counts,new StocktakeRequest{RequestId=Guid.NewGuid(),Name="이력 검증",WarehouseId=s.Warehouse,BasisAt=DateTimeOffset.UtcNow});var id=Id(d.GetProperty("document"));async Task Step(string a){d=await Post(c,counts+"/"+id+"/"+a,new{version=Version(d.GetProperty("document"))},HttpStatusCode.OK);}
  await Step("start");var items=(await Get(c,counts+"/"+id+"/items")).GetProperty("items");d=await Post(c,counts+"/"+id+"/counts",new{version=Version(d.GetProperty("document")),items=items.EnumerateArray().Select(x=>new{targetId=Id(x),quantity=x.GetProperty("baselineQuantity").GetDecimal()+1,reason="실물 확인"})},HttpStatusCode.OK);await Step("complete");await Step("review");await Step("confirm");await Step("confirm");
  var list=await Get(c,History(t)+"?pageSize=100");var rows=list.GetProperty("items").EnumerateArray().ToArray();Assert.Equal(8,rows.Length);Assert.Equal(6,list.GetProperty("summary").GetProperty("workCount").GetInt32());Assert.Equal(4,list.GetProperty("summary").GetProperty("operationRows").GetInt32());Assert.Equal(2,list.GetProperty("summary").GetProperty("stocktakeRows").GetInt32());
  foreach(var row in rows){var detail=await Get(c,History(t)+"/"+Id(row));Assert.True(detail.GetProperty("row").GetProperty("documentLinked").GetBoolean());switch(row.GetProperty("type").GetString()){
   case "ReceiptConfirmed":case "ShipmentConfirmed":Assert.Equal(s.Location,row.GetProperty("locationId").GetGuid());Assert.Equal("Confirmed",detail.GetProperty("document").GetProperty("status").GetString());break;
   case "MoveIn":case "MoveOut":Assert.Equal(Id(operation),row.GetProperty("documentId").GetGuid());Assert.Equal(2,detail.GetProperty("total").GetInt32());Assert.Equal(0,detail.GetProperty("related").EnumerateArray().Sum(x=>x.GetProperty("quantity").GetDecimal()));break;
   case "AdjustmentIncrease":Assert.Equal(2,detail.GetProperty("operation").GetProperty("afterSource").GetDecimal()-detail.GetProperty("operation").GetProperty("beforeSource").GetDecimal());break;
   case "StocktakeIncrease":Assert.Equal(1,detail.GetProperty("countTarget").GetProperty("countedQuantity").GetDecimal()-detail.GetProperty("countTarget").GetProperty("baselineQuantity").GetDecimal());break;
  }}
  using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(await db.StockMovements.CountAsync(),rows.Length);
 }
 [Fact] public async Task SerialMovesKeepOriginalReceiptAndShipmentPositionsAndLinkBothMoveSides()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);var target=await Target(f,t,s,true);
  async Task<JsonElement> Serial(string serial)=>(await Get(c,Inventory(t)+"?pageSize=100")).GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("serialNumber").GetString()==serial);
  var serial=await Serial("SN-1");var move=Input(serial,1);move.WarehouseId=target.warehouse;move.LocationId=target.location;await Post(c,Inventory(t)+"/move",move);Assert.Equal(Id(serial),Id(await Serial("SN-1")));
  var shipment=await Post(c,Root(t),OutRequest(s,1,true));shipment=await Action(c,t,shipment,"start-picking");shipment=await Work(c,t,shipment,"picking");shipment=await Work(c,t,shipment,"inspection");await Action(c,t,shipment,"confirm");
  var increase=Input(await Serial("SN-2"),1);increase.Increase=true;await Post(c,Inventory(t)+"/adjust",increase);move=Input(await Serial("SN-2"),1);move.WarehouseId=target.warehouse;move.LocationId=target.location;await Post(c,Inventory(t)+"/move",move);
  var all=(await Get(c,History(t)+"?pageSize=100")).GetProperty("items").EnumerateArray().ToArray();Assert.Equal(8,all.Length);
  foreach(var row in all){var type=row.GetProperty("type").GetString();Assert.Equal(type=="MoveIn"?target.location:s.Location,row.GetProperty("locationId").GetGuid());Assert.Equal(type=="MoveIn"?target.warehouse:s.Warehouse,row.GetProperty("warehouseId").GetGuid());}
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var original=await db.StorageLocations.SingleAsync(x=>x.Id==s.Location);original.Code="RENAMED";db.Add(new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="FLOOR-1",Name="재사용 코드 위치"});await db.SaveChangesAsync();}
  var historicalShipment=(await Get(c,History(t)+"?type=shipment")).GetProperty("items")[0];Assert.Equal(s.Location,historicalShipment.GetProperty("locationId").GetGuid());Assert.Equal("FLOOR-1",historicalShipment.GetProperty("locationCode").GetString());
  Assert.Equal(2,(await Get(c,History(t)+"?type=receipt&warehouseId="+s.Warehouse)).GetProperty("total").GetInt32());Assert.Equal(2,(await Get(c,History(t)+"?warehouseId="+target.warehouse)).GetProperty("total").GetInt32());Assert.Equal(1,(await Get(c,History(t)+"?type=shipment&serial=SN-2&lot=LOT-B")).GetProperty("total").GetInt32());
 }
 [Fact] public async Task MissingLocationReferencesStayVisibleWithoutInventedPositionsAndDatesAreStable()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var stock=await Stock(c,t,s.Bulk);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();foreach(var stamp in new[]{"2026-09-30T14:59:59Z","2026-09-30T15:00:00Z","2026-10-01T14:59:59Z","2026-10-01T15:00:00Z"}){var doc=new InboundReceipt{TenantId=t.Tenant,PartnerId=s.Partner,WarehouseId=s.Warehouse,Status="Confirmed",Number=Guid.NewGuid().ToString(),RequestId=Guid.NewGuid(),ConfirmedAt=DateTimeOffset.Parse(stamp),ConfirmedByUserId=t.Actor};var legacyStock=new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=s.Location,Unit="kg",SourceKey=Guid.NewGuid().ToString()};db.AddRange(doc,legacyStock,new StockMovement{TenantId=t.Tenant,StockId=legacyStock.Id,ReceiptId=doc.Id,Type="ReceiptConfirmed",Quantity=.125m,ActorId=t.Actor,CreatedAt=DateTimeOffset.Parse(stamp)});}await db.SaveChangesAsync();}
  var r=await Get(c,History(t)+"?start=2026-10-01&end=2026-10-01");Assert.Equal(2,r.GetProperty("total").GetInt32());Assert.Equal(2,r.GetProperty("summary").GetProperty("workCount").GetInt32());foreach(var row in r.GetProperty("items").EnumerateArray()){Assert.True(row.GetProperty("documentLinked").GetBoolean());Assert.Equal(JsonValueKind.Null,row.GetProperty("locationId").ValueKind);var detail=await Get(c,History(t)+"/"+Id(row));Assert.Equal(JsonValueKind.Null,detail.GetProperty("operation").ValueKind);Assert.Equal(1,detail.GetProperty("total").GetInt32());}
 }
 [Fact] public async Task ServerFiltersPaginationFullExportLimitAndTenantPermissions()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
  for(int i=0;i<23;i++){var req=Input(await Stock(c,t,s.Bulk),.1m);req.Increase=true;req.Reason="=HYPERLINK(\"unsafe\")";await Post(c,Inventory(t)+"/adjust",req);}
  var r=await Get(c,History(t)+"?page=2");Assert.Equal(24,r.GetProperty("total").GetInt32());Assert.Equal(4,r.GetProperty("items").GetArrayLength());Assert.Equal(24,r.GetProperty("summary").GetProperty("rows").GetInt32());
  var first=r.GetProperty("items")[0];Assert.Equal(1,(await Get(c,History(t)+"?document="+first.GetProperty("documentNumber").GetString())).GetProperty("total").GetInt32());Assert.Equal(24,(await Get(c,History(t)+"?search=BULK&actorId="+t.Actor+"&locationId="+s.Location)).GetProperty("total").GetInt32());Assert.Equal(0,(await Get(c,History(t)+"?warehouseId="+Guid.NewGuid())).GetProperty("total").GetInt32());
  var documentTerm=Uri.EscapeDataString(first.GetProperty("documentNumber").GetString()!.ToLowerInvariant());
  var unified=await Get(c,History(t)+"?search="+documentTerm);Assert.Equal(1,unified.GetProperty("total").GetInt32());Assert.Equal(Id(first),Id(unified.GetProperty("items")[0]));
  Assert.Equal(0,(await Get(c,History(t)+"?search=not-a-product-or-document")).GetProperty("total").GetInt32());
  var filteredCsv=Encoding.UTF8.GetString(await c.GetByteArrayAsync(History(t)+"/export?format=csv&search="+documentTerm));Assert.Equal(3,filteredCsv.Split('\n').Length);Assert.Contains(first.GetProperty("documentNumber").GetString()!,filteredCsv);
  var bytes=await c.GetByteArrayAsync(History(t)+"/export?page=2&format=csv");Assert.Equal(new byte[]{239,187,191},bytes.Take(3));var csv=Encoding.UTF8.GetString(bytes);Assert.Equal(26,csv.Split('\n').Length);Assert.Contains("'=HYPERLINK",csv);using(var zip=new ZipArchive(new MemoryStream(await c.GetByteArrayAsync(History(t)+"/export?page=2&format=xlsx")))){using var sheet=zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=XDocument.Load(sheet);XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";Assert.Equal(25,xml.Descendants(ns+"row").Count());Assert.Empty(xml.Descendants(ns+"f"));}
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>Service(db,20).Export(t.Tenant,new(),"csv",default));}
  using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(History(t))).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/tenants/{t.Other}/reports/stock-history/"+Id(first))).StatusCode);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"]["stock-history"]=[];db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(roles),UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid()});await db.SaveChangesAsync();}
  using var reader=f.Client();await Login(reader,t,"Reader");foreach(var path in new[]{"","/summary","/"+Id(first),"/export?format=csv","/choices?kind=actors"})Assert.Equal(HttpStatusCode.Forbidden,(await reader.GetAsync(History(t)+path)).StatusCode);
  foreach(var kind in new[]{"actors","warehouses","racks","locations"})Assert.True((await c.GetAsync(History(t)+"/choices?kind="+kind+"&warehouseId="+s.Warehouse)).IsSuccessStatusCode);
  foreach(var query in new[]{"start=2026-10-02&end=2026-10-01","end=0001-01-01","type=bad","pageSize=100000"})Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(History(t)+"?"+query)).StatusCode);
 }
 [Fact] public async Task DefaultTwentyThousandRowCapAcceptsBoundaryAndRejectsOverflow()
 {
  using var f=new AuthFactory();using var initialized=f.Client();var t=await Seed(f);var s=await Setup(f,t);using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
  var stock=new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=s.Location,Unit="kg",SourceKey="CAP"};db.Add(stock);
  for(int i=0;i<20001;i++){var op=new InventoryOperation{TenantId=t.Tenant,ProductId=s.Bulk,Number="CAP-"+i,Type=i==20000?"Decrease":"Increase",Quantity=1,Unit="kg",ActorId=t.Actor,RequestId=Guid.NewGuid(),CreatedAt=DateTimeOffset.UtcNow,OccurredAt=DateTimeOffset.UtcNow};db.Add(op);db.StockMovements.Add(new(){TenantId=t.Tenant,StockId=stock.Id,OperationId=op.Id,Type=i==20000?"AdjustmentDecrease":"AdjustmentIncrease",Quantity=i==20000?-1:1,ActorId=t.Actor,CreatedAt=DateTimeOffset.UtcNow});}await db.SaveChangesAsync();db.ChangeTracker.Clear();
  var service=Service(db);var error=await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>service.Export(t.Tenant,new(),"csv",default));Assert.Equal(413,error.StatusCode);
  var file=await service.Export(t.Tenant,new(){Type="increase",Page=2},"csv",default);await using var stream=file.stream;using var reader=new StreamReader(stream);int lines=0;while(await reader.ReadLineAsync()!=null)lines++;Assert.Equal(20001,lines);
 }
}
