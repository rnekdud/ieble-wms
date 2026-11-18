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

public sealed class StockOverviewTests
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
    static string Overview(Fixture t)=>$"/api/tenants/{t.Tenant}/reports/stock-overview";
    static StockOverviewService Service(WmsDbContext db,StockOverviewOptions? options=null,TimeProvider? clock=null)=>new(db,clock??TimeProvider.System,Options.Create(options??new()));
    static async Task<JsonElement> Get(HttpClient c,string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
    [Fact]
    public async Task WarehouseSummaryGroupsByWarehouseWithoutDuplicatingProductsOrMixingUnits()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var destination=await Target(f,t,s,true);
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            foreach(var (product,warehouse,location,unit,qty,reserved) in new[]{
                (s.Bulk,s.Warehouse,s.Location,"kg",2m,1m),(s.Bulk,s.Warehouse,s.Location,"kg",3m,0m),
                (s.Serial,s.Warehouse,s.Location,"EA",10m,2m),(s.Serial,destination.warehouse,destination.location,"EA",4m,1m)})
                db.Add(new StockBalance{TenantId=t.Tenant,ProductId=product,WarehouseId=warehouse,LocationId=location,SourceKey=Guid.NewGuid().ToString(),Unit=unit,Quantity=qty,ReservedQuantity=reserved});
            await db.SaveChangesAsync();
        }
        var result=await Get(c,Overview(t)+"/warehouse-summary");Assert.Equal(2,result.GetProperty("total").GetInt32());
        var first=result.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("warehouseId").GetGuid()==s.Warehouse);
        Assert.Equal(2,first.GetProperty("productCount").GetInt32());Assert.Equal(2,first.GetProperty("quantities").GetArrayLength());
        var kg=first.GetProperty("quantities").EnumerateArray().Single(x=>x.GetProperty("unit").GetString()=="kg");
        Assert.Equal(5m,kg.GetProperty("quantity").GetDecimal());Assert.Equal(1m,kg.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(4m,kg.GetProperty("availableQuantity").GetDecimal());
        var ea=first.GetProperty("quantities").EnumerateArray().Single(x=>x.GetProperty("unit").GetString()=="EA");Assert.Equal(8m,ea.GetProperty("availableQuantity").GetDecimal());
        Assert.Equal(1,(await Get(c,Overview(t)+"/warehouse-summary?search=BULK")).GetProperty("total").GetInt32());
        Assert.Equal(0,(await Get(c,Overview(t)+"/warehouse-summary?warehouseId="+t.Other)).GetProperty("total").GetInt32());
        var products=await Get(c,Overview(t)+"?view=warehouse&warehouseId="+s.Warehouse);Assert.Equal(2,products.GetProperty("total").GetInt32());
        var locations=await Get(c,Overview(t)+"/products/"+s.Bulk+"?warehouseId="+s.Warehouse);Assert.Equal(5m,locations.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(Overview(t)+"/warehouse-summary")).StatusCode);
        using var verify=f.Services.CreateScope();var check=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(4,await check.StockBalances.CountAsync());Assert.Empty(await check.StockMovements.ToListAsync());
    }

    [Fact]
    public async Task LocationHierarchyOrdersBeforePagingWithoutChangingStockOrOtherViews()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        Guid a1,a2,ar2,az2,b1;Guid secondWarehouse;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Warehouses.SingleAsync(w=>w.Id==s.Warehouse)).Name="A 창고";
            var w2=new Warehouse{TenantId=t.Tenant,Code="WH-2",Name="B 창고"};secondWarehouse=w2.Id;
            var za=new WarehouseZone{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="ZA",Name="A 구역"};
            var zb=new WarehouseZone{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="ZB",Name="B 구역"};
            var z2=new WarehouseZone{TenantId=t.Tenant,WarehouseId=w2.Id,Code="ZA",Name="A 구역"};
            WarehouseRack Rack(Guid warehouse,Guid zone,string code)=>new(){TenantId=t.Tenant,WarehouseId=warehouse,ZoneId=zone,Code=code,Name="동일 랙명",Levels=1,Bays=2};
            var ra=Rack(s.Warehouse,za.Id,"R-01");var rb=Rack(s.Warehouse,za.Id,"R-02");var rz=Rack(s.Warehouse,zb.Id,"R-03");var r2=Rack(w2.Id,z2.Id,"R-01");
            StorageLocation Location(WarehouseRack rack,string code,int bay)=>new(){TenantId=t.Tenant,WarehouseId=rack.WarehouseId,RackId=rack.Id,Code=code,Name="1단 1칸",Level=1,Bay=bay};
            var la=Location(ra,"A-01",1);var la2=Location(ra,"A-02",2);var lr=Location(rb,"B-01",1);var lz=Location(rz,"C-01",1);var lb=Location(r2,"A-01",1);
            a1=la.Id;a2=la2.Id;ar2=lr.Id;az2=lz.Id;b1=lb.Id;
            db.AddRange(w2,za,zb,z2,ra,rb,rz,r2,la,la2,lr,lz,lb);await db.SaveChangesAsync();
            foreach(var (location,n) in new[]{(lb,1),(lz,1),(lr,1),(la2,1),(la,22)})
                for(var i=0;i<n;i++)db.Add(new StockBalance{TenantId=t.Tenant,ProductId=i%2==0?s.Serial:s.Bulk,WarehouseId=location.WarehouseId,LocationId=location.Id,SourceKey=Guid.NewGuid().ToString(),Unit=i%2==0?"EA":"kg",LotNumber="TRACE-"+i.ToString("D2"),Quantity=10,ReservedQuantity=2});
            await db.SaveChangesAsync();
        }
        var first=await Get(c,Overview(t)+"?view=location&page=1");var second=await Get(c,Overview(t)+"?view=location&page=2");
        Assert.Equal(26,first.GetProperty("total").GetInt32());Assert.Equal(20,first.GetProperty("items").GetArrayLength());Assert.Equal(6,second.GetProperty("items").GetArrayLength());
        var rows=first.GetProperty("items").EnumerateArray().Concat(second.GetProperty("items").EnumerateArray()).ToArray();
        Assert.Equal(Enumerable.Repeat(a1,22).Concat(new[]{a2,ar2,az2,b1}),rows.Select(r=>r.GetProperty("locationId").GetGuid()));
        Assert.All(rows,r=>{Assert.Equal(10,r.GetProperty("quantity").GetDecimal());Assert.Equal(2,r.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(8,r.GetProperty("availableQuantity").GetDecimal());});
        Assert.Equal(22,(await Get(c,Overview(t)+"?view=location&locationId="+a1)).GetProperty("total").GetInt32());
        Assert.Equal(1,(await Get(c,Overview(t)+"?view=location&warehouseId="+secondWarehouse)).GetProperty("total").GetInt32());
        Assert.Equal(1,(await Get(c,Overview(t)+"?view=location&search=TRACE-21")).GetProperty("total").GetInt32());
        Assert.Equal("BULK",(await Get(c,Overview(t)+"?view=product")).GetProperty("items")[0].GetProperty("productCode").GetString());
        using var verify=f.Services.CreateScope();var check=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(26,await check.StockBalances.CountAsync());Assert.Empty(await check.StockMovements.ToListAsync());
    }

    [Fact]
    public async Task QueryTranslationAndNoStockProductsAreVisibleWithoutWritingData()
    {
        using var f=new AuthFactory();using var initialized=f.Client();var t=await Seed(f);var s=await Setup(f,t);using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var service=Service(db);
        var result=JsonSerializer.SerializeToElement(await service.List(t.Tenant,new(),default));Assert.Equal(2,result.GetProperty("total").GetInt32());Assert.Equal(2,result.GetProperty("summary").GetProperty("registeredProducts").GetInt32());Assert.Equal(0,result.GetProperty("summary").GetProperty("holdingProducts").GetInt32());Assert.Empty(await db.StockBalances.ToListAsync());
    }
    [Fact]
    public async Task ProductWarehouseLocationGroupingAndGlobalSafetyStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var target=await Target(f,t,s,true);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Products.SingleAsync(x=>x.Id==s.Bulk)).SafetyStock=8;await db.SaveChangesAsync();}
        var move=Input(await Stock(c,t,s.Bulk),8);move.WarehouseId=target.warehouse;move.LocationId=target.location;await Post(c,Inventory(t)+"/move",move);
        var product=await Get(c,Overview(t)+"?view=product&search=BULK");Assert.Equal(9.25m,product.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        var w=await Get(c,Overview(t)+"?view=warehouse&warehouseId="+s.Warehouse);Assert.Equal(1,w.GetProperty("total").GetInt32());var row=w.GetProperty("items")[0];Assert.Equal(1.25m,row.GetProperty("availableQuantity").GetDecimal());Assert.Equal(9.25m,row.GetProperty("globalAvailableQuantity").GetDecimal());Assert.False(row.GetProperty("isLow").GetBoolean());
        Assert.Equal(2,(await Get(c,Overview(t)+"?view=location")).GetProperty("total").GetInt32());Assert.Equal(1,product.GetProperty("summary").GetProperty("holdingProducts").GetInt32());
        var detail=await Get(c,Overview(t)+"/products/"+s.Bulk);Assert.Equal(2,detail.GetProperty("total").GetInt32());Assert.NotEmpty(detail.GetProperty("recentReceipts").EnumerateArray());Assert.Equal(2,detail.GetProperty("recentChanges").GetArrayLength());
    }
    [Fact]
    public async Task ReservationsShippingAdjustmentsAndCountConfirmationAreImmediatelyReflected()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Products.SingleAsync(x=>x.Id==s.Bulk)).SafetyStock=8;await db.SaveChangesAsync();}
        var shipment=await Post(c,Root(t),OutRequest(s,3));var list=await Get(c,Overview(t)+"?search=BULK");var row=list.GetProperty("items")[0];Assert.Equal(9.25m,row.GetProperty("quantity").GetDecimal());Assert.Equal(3,row.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(6.25m,row.GetProperty("availableQuantity").GetDecimal());Assert.True(row.GetProperty("isLow").GetBoolean());
        shipment=await Action(c,t,shipment,"start-picking");shipment=await Work(c,t,shipment,"picking");shipment=await Work(c,t,shipment,"inspection");await Action(c,t,shipment,"confirm");row=(await Get(c,Overview(t)+"?search=BULK")).GetProperty("items")[0];Assert.Equal(6.25m,row.GetProperty("quantity").GetDecimal());Assert.Equal(0,row.GetProperty("reservedQuantity").GetDecimal());
        var r=Input(await Stock(c,t,s.Bulk),2);r.Increase=true;await Post(c,Inventory(t)+"/adjust",r);Assert.Equal(8.25m,(await Get(c,Overview(t)+"?search=BULK")).GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        var counts=$"/api/tenants/{t.Tenant}/stocktakes";var d=await Post(c,counts,new StocktakeRequest{RequestId=Guid.NewGuid(),Name="현황 검증",WarehouseId=s.Warehouse,BasisAt=DateTimeOffset.UtcNow});var id=Id(d.GetProperty("document"));
        async Task Step(string action){d=await Post(c,counts+"/"+id+"/"+action,new{version=Version(d.GetProperty("document"))},HttpStatusCode.OK);}
        await Step("start");var items=(await Get(c,counts+"/"+id+"/items")).GetProperty("items");d=await Post(c,counts+"/"+id+"/counts",new{version=Version(d.GetProperty("document")),items=items.EnumerateArray().Select(x=>new{targetId=Id(x),quantity=7,reason="실물 확인"})},HttpStatusCode.OK);await Step("complete");await Step("review");await Step("confirm");
        Assert.Equal(7,(await Get(c,Overview(t)+"?search=BULK")).GetProperty("items")[0].GetProperty("quantity").GetDecimal());var detail=await Get(c,Overview(t)+"/products/"+s.Bulk);Assert.Single(detail.GetProperty("recentShipments").EnumerateArray());Assert.Contains(detail.GetProperty("recentChanges").EnumerateArray(),x=>x.GetProperty("type").GetString()=="StocktakeDecrease");
    }
    sealed class Clock:TimeProvider {public override DateTimeOffset GetUtcNow()=>new(2026,10,30,15,30,0,TimeSpan.Zero);}
    [Fact]
    public async Task ExpiryUsesKoreanDateInclusiveThirtyDaysAndMultipleStatuses()
    {
        using var f=new AuthFactory();using var initialized=f.Client();var t=await Seed(f);var s=await Setup(f,t);using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=await db.Products.SingleAsync(x=>x.Id==s.Bulk);p.ExpiryManaged=true;p.SafetyStock=50;
        foreach(var (date,qty) in new[]{(new DateOnly(2026,10,30),1m),(new DateOnly(2026,10,31),2m),(new DateOnly(2026,11,30),3m),(new DateOnly(2026,12,1),4m),(new DateOnly(2026,10,1),0m)})db.Add(new StockBalance{TenantId=t.Tenant,ProductId=p.Id,WarehouseId=s.Warehouse,LocationId=s.Location,SourceKey=Guid.NewGuid().ToString(),Unit=p.Unit,LotNumber=date.ToString(),ExpiryDate=date,Quantity=qty});await db.SaveChangesAsync();
        var service=Service(db,clock:new Clock());Assert.Equal(new DateOnly(2026,10,31),service.Today);var result=JsonSerializer.SerializeToElement(await service.List(t.Tenant,new(){ProductId=p.Id},default));var row=result.GetProperty("items")[0];Assert.Equal(3,row.GetProperty("Statuses").GetArrayLength());
        result=JsonSerializer.SerializeToElement(await service.List(t.Tenant,new(){View="location",Status="expiring"},default));Assert.Equal(2,result.GetProperty("total").GetInt32());result=JsonSerializer.SerializeToElement(await service.List(t.Tenant,new(){View="location",Status="expired"},default));Assert.Equal(1,result.GetProperty("total").GetInt32());
        var custom=Service(db,new(){ExpirySoonDays=0},new Clock());result=JsonSerializer.SerializeToElement(await custom.List(t.Tenant,new(){View="location",Status="expiring"},default));Assert.Equal(1,result.GetProperty("total").GetInt32());
    }
    [Fact]
    public async Task DecimalUnitsAndProvenanceRowsAggregateWithoutMixingUnits()
    {
        using var f=new AuthFactory();using var initialized=f.Client();var t=await Seed(f);var s=await Setup(f,t);using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=await db.Products.SingleAsync(x=>x.Id==s.Bulk);p.SafetyStock=.3m;
        foreach(var (unit,qty) in new[]{("kg",.1m),("kg",.2m),("EA",5m)})db.Add(new StockBalance{TenantId=t.Tenant,ProductId=p.Id,WarehouseId=s.Warehouse,LocationId=s.Location,Unit=unit,Quantity=qty,SourceKey=Guid.NewGuid().ToString()});await db.SaveChangesAsync();
        var result=JsonSerializer.SerializeToElement(await Service(db).List(t.Tenant,new(){ProductId=p.Id,View="location"},default));Assert.Equal(2,result.GetProperty("total").GetInt32());var rows=result.GetProperty("items").EnumerateArray().ToArray();var kg=rows.Single(x=>x.GetProperty("Unit").GetString()=="kg");Assert.Equal(.3m,kg.GetProperty("Quantity").GetDecimal());Assert.False(kg.GetProperty("IsLow").GetBoolean());Assert.False(rows.Single(x=>x.GetProperty("Unit").GetString()=="EA").GetProperty("SafetyComparable").GetBoolean());
    }
    [Fact]
    public async Task ExportsAllFilteredRowsUtf8AndSafeSpreadsheetStrings()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();for(var i=0;i<25;i++)db.Products.Add(new(){TenantId=t.Tenant,Code="EXPORT-"+i.ToString("D2"),NormalizedCode="EXPORT-"+i.ToString("D2"),Name=i==0?"=HYPERLINK(\"http://invalid\")":"한글 상품 "+i,Unit="EA",CreationRequestId=Guid.NewGuid()});await db.SaveChangesAsync();}
        var list=await Get(c,Overview(t)+"?search=EXPORT&page=2");Assert.Equal(25,list.GetProperty("total").GetInt32());Assert.Equal(5,list.GetProperty("items").GetArrayLength());
        var csv=await c.GetByteArrayAsync(Overview(t)+"/export?format=csv&search=EXPORT&page=2");Assert.True(csv.Take(3).SequenceEqual(new byte[]{239,187,191}));var text=Encoding.UTF8.GetString(csv);Assert.Equal(26,text.Split('\n',StringSplitOptions.RemoveEmptyEntries).Length);Assert.Contains("'=HYPERLINK",text);Assert.Contains("한글 상품",text);Assert.DoesNotContain("중량 상품",text);
        var xlsx=await c.GetByteArrayAsync(Overview(t)+"/export?format=xlsx&search=EXPORT&page=2");using var zip=new ZipArchive(new MemoryStream(xlsx));using var sheet=zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=XDocument.Load(sheet);XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";Assert.Equal(26,xml.Descendants(ns+"row").Count());Assert.Empty(xml.Descendants(ns+"f"));Assert.Contains(xml.Descendants(ns+"t"),x=>x.Value.StartsWith("=HYPERLINK"));
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var ex=await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>Service(context,new(){MaxExportRows=1}).Export(t.Tenant,new(),"csv",default));Assert.Equal(413,ex.StatusCode);Assert.Empty(await context.StockBalances.ToListAsync());
    }
    [Theory][InlineData("=SUM(A1)")][InlineData(" +1")][InlineData("-1+2")][InlineData("@SUM(1)")][InlineData("\tformula")][InlineData("\r=1")]
    public void CsvFormulaPrefixesAreEscaped(string value)=>Assert.StartsWith("'",StockOverviewExport.SafeCsvText(value));
    [Fact]
    public async Task FiltersAndReadOnlyPermissionsDoNotLeakOtherTenants()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var report=await Get(c,Overview(t)+"?warehouseId="+s.OtherLocation);Assert.Equal(0,report.GetProperty("total").GetInt32());
        foreach(var kind in new[]{"warehouses","categories","zones","racks","locations"})await Get(c,Overview(t)+"/choices?kind="+kind+"&warehouseId="+s.Warehouse);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(Overview(t)+"/export?format=csv")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/reports/stock-overview/products/{s.Bulk}")).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var grants=PermissionCatalog.Defaults();grants["Employee"]["stock-overview"]=[];db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(grants),UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid()});await db.SaveChangesAsync();}
        await Login(c,t,"Reader");foreach(var path in new[]{"","/summary","/products/"+s.Bulk,"/export?format=csv"})Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(Overview(t)+path)).StatusCode);
    }
}
