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
namespace IebleWms.Api.Tests;

public sealed partial class ShipmentTests
{
    record Fixture(Guid Tenant,Guid Other,Guid Actor,string Password) {public string Root=>$"/api/tenants/{Tenant}/receipts";}
    static async Task<Fixture> Seed(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f)
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
    static async Task<Structure> Setup(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f,Fixture t)
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
    [Fact]
    public async Task ReservePickInspectConfirmSharesInboundStockAndIsIdempotent()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);
        var request=OutRequest(s,2,true);var d=await Post(c,Root(t),request);var id=Id(Shipment(d));Assert.Equal(2,d.GetProperty("allocations").GetArrayLength());
        Assert.Equal(id,Id(Shipment(await Post(c,Root(t),request))));
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.All(await db.StockBalances.ToListAsync(),x=>{Assert.Equal(1,x.Quantity);Assert.Equal(1,x.ReservedQuantity);});Assert.Equal(2,await db.StockMovements.CountAsync());}
        d=await Action(c,t,d,"start-picking");d=await Work(c,t,d,"picking");d=await Work(c,t,d,"inspection");var original=d;d=await Action(c,t,d,"confirm");Assert.Equal("Confirmed",Shipment(d).GetProperty("status").GetString());await Action(c,t,original,"confirm");
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.All(await db.StockBalances.ToListAsync(),x=>{Assert.Equal(0,x.Quantity);Assert.Equal(0,x.ReservedQuantity);});Assert.Equal(4,await db.StockMovements.CountAsync());Assert.Equal(2,await db.StockMovements.CountAsync(x=>x.ShipmentId==id&&x.Quantity==-1));Assert.Equal(1,await db.ShipmentChanges.CountAsync(x=>x.Action=="Confirmed"));Assert.All(await db.ShipmentAllocations.ToListAsync(),x=>Assert.Equal("Consumed",x.State));}
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/"+id+"/cancel",new{version=Version(Shipment(d))})).StatusCode);
        request.Version=Version(Shipment(d));Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/"+id,request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t),OutRequest(s,1,true))).StatusCode);
    }
    [Fact]
    public async Task FailedReservationAndEditRollbackAndCancelRestoresAvailability()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
        var d=await Post(c,Root(t),OutRequest(s,6));var id=Id(Shipment(d));var req=OutRequest(s,10);req.Version=Version(Shipment(d));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/"+id,req)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t),OutRequest(s,4))).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(6,(await db.StockBalances.SingleAsync()).ReservedQuantity);Assert.Equal(1,await db.OutboundShipments.CountAsync());Assert.Equal(Version(Shipment(d)),(await db.OutboundShipments.SingleAsync()).Version);}
        req.Lines[0].RequestedQuantity=4;d=await Post(c,Root(t)+"/"+id,req,HttpStatusCode.OK);Assert.Equal(id,Id(Shipment(d)));
        d=await Action(c,t,d,"cancel");await Action(c,t,d,"cancel");
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await context.StockBalances.SingleAsync();Assert.Equal(9.25m,stock.Quantity);Assert.Equal(0,stock.ReservedQuantity);Assert.Equal(1,await context.StockMovements.CountAsync());
    }
    [Fact]
    public async Task PickingAndInspectionEnforceCountsVersionsAndOrder()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Post(c,Root(t),OutRequest(s));var path=Root(t)+"/"+Id(Shipment(d));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/confirm",new{version=Version(Shipment(d))})).StatusCode);
        d=await Action(c,t,d,"start-picking");var stale=d;
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,path+"/picking",WorkBody(d,true,4))).StatusCode);
        d=await Work(c,t,d,"picking",false,1);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/picking",WorkBody(stale))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/cancel",new{version=Version(Shipment(d))})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,path+"/picking",WorkBody(d,false,0))).StatusCode);
        d=await Work(c,t,d,"picking");await Work(c,t,d,"picking");
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,path+"/inspection",WorkBody(d,true,2))).StatusCode);
        d=await Work(c,t,d,"inspection",false,2);d=await Work(c,t,d,"inspection");await Action(c,t,d,"confirm");
    }
    [Fact]
    public async Task ConfirmationForeignKeyFailureRollsBackInventoryReservationDocumentAndAudit()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Post(c,Root(t),OutRequest(s));d=await Action(c,t,d,"start-picking");d=await Work(c,t,d,"picking");d=await Work(c,t,d,"inspection");
        using(var scope=f.Services.CreateScope()){var service=scope.ServiceProvider.GetRequiredService<IebleWms.Api.Shipping.ShipmentService>();await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>service.Confirm(t.Tenant,Guid.NewGuid(),Id(Shipment(d)),new(){Version=Version(Shipment(d))},CancellationToken.None));}
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.SingleAsync();Assert.Equal(9.25m,stock.Quantity);Assert.Equal(3,stock.ReservedQuantity);Assert.Equal("Inspected",(await db.OutboundShipments.SingleAsync()).Status);Assert.Equal(1,await db.StockMovements.CountAsync());Assert.Equal(0,await db.ShipmentChanges.CountAsync(x=>x.Action=="Confirmed"));
    }
    [Theory]
    [InlineData("product")][InlineData("warehouse")][InlineData("partner")][InlineData("serial")][InlineData("lot")][InlineData("expiry")][InlineData("precision")]
    public async Task InvalidReferencesAndTrackingFiltersNeverReserve(string field)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);var r=OutRequest(s,2,true);
        switch(field){case "product":r.Lines[0].ProductId=Guid.NewGuid();break;case "warehouse":r.WarehouseId=Guid.NewGuid();break;case "partner":r.PartnerId=Guid.NewGuid();break;case "serial":r.Lines[0].Serials=["SN-1","SN-1"];break;case "lot":r.Lines[0].LotNumber="MISSING";break;case "expiry":r.Lines[0].ExpiryDate=new(2030,1,1);break;case "precision":r.Lines[0].RequestedQuantity=1.1234m;break;}
        var response=await AuthTests.Post(c,Root(t),r);Assert.True((int)response.StatusCode is 400 or 404 or 409);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.OutboundShipments.ToListAsync());Assert.All(await db.StockBalances.ToListAsync(),x=>Assert.Equal(0,x.ReservedQuantity));
    }
    [Fact]
    public async Task TenantPermissionsSearchChoicesAndStockAreScoped()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Post(c,Root(t),OutRequest(s));var id=Id(Shipment(d));
        foreach(var term in new[]{"BULK","중량","매입처",Shipment(d).GetProperty("number").GetString()!})Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(Root(t)+"?search="+Uri.EscapeDataString(term))).GetProperty("total").GetInt32());
        foreach(var kind in new[]{"products","partners","warehouses"})Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(Root(t)+"/choices?kind="+kind)).StatusCode);
        var stock=await c.GetFromJsonAsync<JsonElement>(Root(t)+$"/stock?warehouseId={s.Warehouse}&productId={s.Bulk}");Assert.Equal(6.25m,stock.GetProperty("available").GetDecimal());
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(Root(t))).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,Root(t),OutRequest(s))).StatusCode);
        foreach(var action in new[]{"start-picking","cancel","picking","inspection","confirm"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,Root(t)+"/"+id+"/"+action,new{version=Version(Shipment(d))})).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(Root(t))).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/shipments/{id}")).StatusCode);
        var otherStock=await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Other}/shipments/stock?warehouseId={s.Warehouse}&productId={s.Bulk}");Assert.Equal(0,otherStock.GetProperty("total").GetInt32());
    }
    [Fact]
    public async Task MultipleLinesSharingStockAggregateMovementAndPreventOverReservation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var r=OutRequest(s,4);r.Lines=[r.Lines[0],new(){ProductId=s.Bulk,RequestedQuantity=4}];var d=await Post(c,Root(t),r);
        d=await Action(c,t,d,"start-picking");d=await Work(c,t,d,"picking");d=await Work(c,t,d,"inspection");d=await Action(c,t,d,"confirm");Assert.Single(d.GetProperty("movements").EnumerateArray());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1.25m,(await db.StockBalances.SingleAsync()).Quantity);
    }
}
