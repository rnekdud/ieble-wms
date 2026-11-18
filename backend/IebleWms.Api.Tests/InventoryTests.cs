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

public sealed partial class InventoryTests
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
    static string Inventory(Fixture t)=>$"/api/tenants/{t.Tenant}/inventory";
    static async Task<JsonElement> Stock(HttpClient c,Fixture t,Guid product)=> (await c.GetFromJsonAsync<JsonElement>(Inventory(t)+"?productId="+product)).GetProperty("items")[0];
    static InventoryRequest Input(JsonElement stock,decimal qty=1)=>new(){RequestId=Guid.NewGuid(),StockId=Id(stock),Version=Version(stock),Quantity=qty,OccurredAt=DateTimeOffset.UtcNow,Reason="검증"};
    static JsonElement Operation(JsonElement d)=>d.GetProperty("operation");
    static async Task<(Guid warehouse,Guid location)> Target(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f,Fixture t,Structure s,bool cross=false)
    {
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var w=s.Warehouse;
        if(cross){var target=new Warehouse{TenantId=t.Tenant,Code="DEST",Name="도착 창고"};db.Add(target);w=target.Id;}
        var loc=new StorageLocation{TenantId=t.Tenant,WarehouseId=w,Code="DEST-LOC",Name="도착 위치"};db.Add(loc);await db.SaveChangesAsync();return(w,loc.Id);
    }
    [Theory][InlineData(false)][InlineData(true)]
    public async Task MovePreservesTotalsProvenanceAndIdsAndReplay(bool cross)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var target=await Target(f,t,s,cross);var stock=await Stock(c,t,s.Bulk);var r=Input(stock,3.25m);r.WarehouseId=target.warehouse;r.LocationId=target.location;
        var result=await Post(c,Inventory(t)+"/move",r);var o=Operation(result);Assert.Equal(2,result.GetProperty("movements").GetArrayLength());Assert.Equal(Id(o),Id(Operation(await Post(c,Inventory(t)+"/move",r))));
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var rows=await db.StockBalances.ToListAsync();Assert.Equal(9.25m,rows.Sum(x=>x.Quantity));Assert.Equal(6,rows.Single(x=>x.Id==Id(stock)).Quantity);Assert.Equal(3.25m,rows.Single(x=>x.LocationId==target.location).Quantity);Assert.Single(rows.Select(x=>x.ReceiptLineId).Distinct());Assert.Equal(1,await db.InventoryChanges.CountAsync());Assert.Equal(3,await db.StockMovements.CountAsync());
        var detail=await c.GetAsync(Inventory(t)+"/"+Id(stock));Assert.True(detail.IsSuccessStatusCode,await detail.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task ReservationBlocksMoveAndDecreaseAndShippingStillConfirms()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var target=await Target(f,t,s);
        var shipment=await Post(c,Root(t),OutRequest(s,6));var stock=await Stock(c,t,s.Bulk);Assert.Equal(3.25m,stock.GetProperty("availableQuantity").GetDecimal());var r=Input(stock,4);r.WarehouseId=target.warehouse;r.LocationId=target.location;
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/move",r)).StatusCode);r.WarehouseId=null;r.LocationId=null;Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/adjust",r)).StatusCode);
        r.Quantity=3.25m;r.WarehouseId=target.warehouse;r.LocationId=target.location;await Post(c,Inventory(t)+"/move",r);
        shipment=await Action(c,t,shipment,"start-picking");shipment=await Work(c,t,shipment,"picking");shipment=await Work(c,t,shipment,"inspection");await Action(c,t,shipment,"confirm");
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var rows=await db.StockBalances.ToListAsync();Assert.Equal(3.25m,rows.Sum(x=>x.Quantity));Assert.All(rows,x=>Assert.Equal(0,x.ReservedQuantity));Assert.Equal(0,rows.Single(x=>x.Id==Id(stock)).Quantity);
    }
    [Fact]
    public async Task IncreaseDecreaseZeroExistingAndAbsentRowsAreDistinct()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var stock=await Stock(c,t,s.Bulk);
        var decrease=Input(stock,9.25m);await Post(c,Inventory(t)+"/adjust",decrease);stock=await Stock(c,t,s.Bulk);Assert.Equal(0,stock.GetProperty("quantity").GetDecimal());var increase=Input(stock,2);increase.Increase=true;await Post(c,Inventory(t)+"/adjust",increase);
        var create=new InventoryRequest{RequestId=Guid.NewGuid(),ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=s.Location,Increase=true,Quantity=3,Reason="입고 누락",OccurredAt=DateTimeOffset.UtcNow};Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/adjust",create)).StatusCode);
        var target=await Target(f,t,s);create.LocationId=target.location;var result=await Post(c,Inventory(t)+"/adjust",create);Assert.Equal(0,Operation(result).GetProperty("beforeSource").GetDecimal());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var rows=await db.StockBalances.ToListAsync();Assert.Equal(2,rows.Count);Assert.Equal(2,rows.Single(x=>x.Id==Id(stock)).Quantity);Assert.Null(rows.Single(x=>x.LocationId==target.location).ReceiptLineId);Assert.Equal(3,await db.InventoryChanges.CountAsync());
    }
    [Fact]
    public async Task SerialMoveKeepsStockIdAndHistoryAndNeverDuplicatesSerial()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);var target=await Target(f,t,s,true);var stock=await Stock(c,t,s.Serial);var r=Input(stock);r.WarehouseId=target.warehouse;r.LocationId=target.location;var result=await Post(c,Inventory(t)+"/move",r);
        Assert.Equal(Id(stock),Operation(result).GetProperty("destinationStockId").GetGuid());Assert.Equal(Id(stock),Operation(result).GetProperty("sourceStockId").GetGuid());
        var after=(await c.GetFromJsonAsync<JsonElement>(Inventory(t)+"/"+Id(stock))).GetProperty("stock");Assert.Equal(target.location,after.GetProperty("locationId").GetGuid());Assert.Equal(stock.GetProperty("serialNumber").GetString(),after.GetProperty("serialNumber").GetString());Assert.Equal(stock.GetProperty("lotNumber").GetString(),after.GetProperty("lotNumber").GetString());
        var duplicate=new InventoryRequest{RequestId=Guid.NewGuid(),ProductId=s.Serial,WarehouseId=s.Warehouse,LocationId=s.Location,Quantity=1,Increase=true,LotNumber="LOT-B",ExpiryDate=new(2027,2,1),SerialNumber=after.GetProperty("serialNumber").GetString(),OccurredAt=DateTimeOffset.UtcNow,Reason="검증"};Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/adjust",duplicate)).StatusCode);
        var bad=Input(after,2);bad.Increase=true;Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/adjust",bad)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.StockBalances.CountAsync());Assert.Equal(4,await db.StockMovements.CountAsync());
    }
    [Theory][InlineData("same")][InlineData("foreign")][InlineData("inactive")][InlineData("quantity")][InlineData("reason")][InlineData("version")][InlineData("tracking")]
    public async Task InvalidMovesPreserveExistingStock(string kind)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var target=await Target(f,t,s);var stock=await Stock(c,t,s.Bulk);var r=Input(stock);r.WarehouseId=target.warehouse;r.LocationId=target.location;
        switch(kind){case "same":r.LocationId=s.Location;break;case "foreign":r.LocationId=s.OtherLocation;break;case "inactive":using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.StorageLocations.SingleAsync(x=>x.Id==target.location)).IsActive=false;await db.SaveChangesAsync();}break;case "quantity":r.Quantity=1.1234m;break;case "reason":r.Reason=" ";break;case "version":r.Version=Guid.NewGuid();break;case "tracking":r.LotNumber="TAMPER";break;}
        var response=await AuthTests.Post(c,Inventory(t)+"/move",r);Assert.True((int)response.StatusCode is 400 or 409);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(9.25m,(await context.StockBalances.SingleAsync()).Quantity);Assert.Empty(await context.InventoryOperations.ToListAsync());
    }
    [Fact]
    public async Task DatabaseFailureRollsBackBothLocationsLedgerAndAudit()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var target=await Target(f,t,s);var r=Input(await Stock(c,t,s.Bulk),3);r.WarehouseId=target.warehouse;r.LocationId=target.location;
        using(var scope=f.Services.CreateScope()){var service=scope.ServiceProvider.GetRequiredService<IebleWms.Api.Inventory.InventoryService>();await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>service.Execute(t.Tenant,Guid.NewGuid(),r,true,default));}
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(9.25m,(await db.StockBalances.SingleAsync()).Quantity);Assert.Equal(1,await db.StockMovements.CountAsync());Assert.Empty(await db.InventoryChanges.ToListAsync());Assert.Empty(await db.InventoryOperations.ToListAsync());
    }
    [Fact]
    public async Task QueriesHistoryPermissionsAndTenantIsolation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var stock=await Stock(c,t,s.Bulk);var req=Input(stock);req.Increase=true;var result=await Post(c,Inventory(t)+"/adjust",req);var op=Id(Operation(result));
        foreach(var path in new[]{"?search=BULK&status=available&active=active","?warehouseId="+s.Warehouse,"/history?search=BULK&type=Increase","/history/"+op,"/"+Id(stock)+"/movements"}){var response=await c.GetAsync(Inventory(t)+path);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());}
        foreach(var kind in new[]{"products","warehouses","warehouse-filter","racks","active-racks","locations","location-filter","stocks"}){var response=await c.GetAsync(Inventory(t)+"/choices?kind="+kind+"&warehouseId="+s.Warehouse);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());}
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,Inventory(t)+"/adjust",req)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,Inventory(t)+"/move",req)).StatusCode);Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(Inventory(t))).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(Inventory(t))).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/inventory/{Id(stock)}")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/inventory/history/{op}")).StatusCode);
    }
    [Fact]
    public async Task NewSerialAdjustmentRequiresSingleQuantityAndLocksUnit()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var r=new InventoryRequest{RequestId=Guid.NewGuid(),ProductId=s.Serial,WarehouseId=s.Warehouse,LocationId=s.Location,Quantity=1,Increase=true,Reason="누락",OccurredAt=DateTimeOffset.UtcNow};
        r.SerialNumber="NEW-SERIAL";r.Quantity=2;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,Inventory(t)+"/adjust",r)).StatusCode);r.Quantity=1;r.LotNumber="LOT-NEW";r.ExpiryDate=new(2027,1,1);r.SerialNumber="NEW-SERIAL";var result=await Post(c,Inventory(t)+"/adjust",r);await Post(c,Inventory(t)+"/adjust",r);r.Quantity=2;Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Inventory(t)+"/adjust",r)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.NotNull((await db.Products.SingleAsync(x=>x.Id==s.Serial)).TrackingLockedAt);Assert.Single(await db.StockBalances.ToListAsync());var operation=await db.InventoryOperations.SingleAsync();operation.Reason="tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
}
