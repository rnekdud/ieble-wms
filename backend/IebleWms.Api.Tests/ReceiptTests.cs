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

public sealed partial class ReceiptTests
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
    [Fact]
    public async Task ConfirmOnlyCreatesInventoryAndHistoryOnceAndProtectsFinalDocuments()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s,true);var id=Id(Doc(d));var version=Version(Doc(d));
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());Assert.Empty(await db.StockMovements.ToListAsync());Assert.NotNull((await db.Products.SingleAsync(x=>x.Id==s.Serial)).TrackingLockedAt);}
        var confirmed=await Post(c,t.Root+"/"+id+"/confirm",new{version},HttpStatusCode.OK);Assert.Equal("Confirmed",Doc(confirmed).GetProperty("status").GetString());Assert.Equal(t.Actor,Doc(confirmed).GetProperty("confirmedByUserId").GetGuid());
        await Post(c,t.Root+"/"+id+"/confirm",new{version},HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id+"/cancel",new{version=Version(Doc(confirmed))})).StatusCode);
        var edit=Request(s);edit.Version=Version(Doc(confirmed));Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id,edit)).StatusCode);
        var stock=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+id+"/stock");Assert.Equal(2,stock.GetProperty("balances").GetArrayLength());Assert.Equal(2,stock.GetProperty("movements").GetArrayLength());
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var balances=await context.StockBalances.ToListAsync();Assert.All(balances,b=>{Assert.Equal(1m,b.Quantity);Assert.Equal(0,b.ReservedQuantity);Assert.Equal("LOT-B",b.LotNumber);Assert.Equal(s.Location,b.LocationId);});Assert.Equal(1,await context.ReceiptChanges.CountAsync(x=>x.Action=="Confirmed"));
    }
    [Fact]
    public async Task SerialDuplicateConfirmationRollsBackEntireSecondDocument()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var first=await Ready(c,t,s,true);await Post(c,t.Root+"/"+Id(Doc(first))+"/confirm",new{version=Version(Doc(first))},HttpStatusCode.OK);
        var second=await Ready(c,t,s,true);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+Id(Doc(second))+"/confirm",new{version=Version(Doc(second))})).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.StockBalances.CountAsync());Assert.Equal(2,await db.StockMovements.CountAsync());Assert.Equal("Inspecting",(await db.InboundReceipts.SingleAsync(x=>x.Id==Id(Doc(second)))).Status);
    }
    [Theory]
    [InlineData("lot")][InlineData("expiry")][InlineData("serial-count")][InlineData("serial-duplicate")][InlineData("precision")][InlineData("partner")][InlineData("warehouse")][InlineData("product")]
    public async Task InvalidCreationRollsBackIncludingProductPolicy(string field)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var r=Request(s,true);
        switch(field){case "lot":r.Lines[0].LotNumber="BAD\nLOT";break;case "expiry":r.Lines[0].ExpiryDate=default(DateOnly);break;case "serial-count":r.Lines[0].Serials=["SN-1"];break;case "serial-duplicate":r.Lines[0].Serials=["SN-1","SN-1"];break;case "precision":r.Lines[0].ExpectedQuantity=1.1234m;break;case "partner":r.PartnerId=Guid.NewGuid();break;case "warehouse":r.WarehouseId=Guid.NewGuid();break;case "product":r.Lines[0].ProductId=Guid.NewGuid();break;}
        var response=await AuthTests.Post(c,t.Root,r);Assert.True((int)response.StatusCode is 400 or 404);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.InboundReceipts.ToListAsync());Assert.Empty(await db.ReceiptChanges.ToListAsync());Assert.All(await db.Products.ToListAsync(),p=>Assert.Null(p.TrackingLockedAt));
    }
    [Fact]
    public async Task SplitLocationsValidateQuantitiesAndForeignInactiveParents()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s);var id=Id(Doc(d));
        foreach(var (loc,qty) in new[]{(s.Location,1m),(s.OtherLocation,9.25m)})Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/"+id+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=loc,quantity=qty,serials=Array.Empty<string>()}}}}})).StatusCode);
        d=await Post(c,t.Root+"/"+id+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=s.Location,quantity=4m},new{locationId=s.Location,quantity=5.25m}}}}},HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.StorageLocations.SingleAsync(x=>x.Id==s.Location)).IsActive=false;await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/"+id+"/confirm",new{version=Version(Doc(d))})).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());(await db.StorageLocations.SingleAsync(x=>x.Id==s.Location)).IsActive=true;await db.SaveChangesAsync();}
        await Post(c,t.Root+"/"+id+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var balances=await context.StockBalances.ToListAsync();Assert.Equal(2,balances.Count);Assert.Equal(9.25m,balances.Sum(x=>x.Quantity));
    }
    [Fact]
    public async Task DraftEditsResetInspectionAndCancellationNeverAddsStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var r=Request(s);var created=await Post(c,t.Root,r);Assert.Equal(Id(Doc(created)),Id(Doc(await Post(c,t.Root,r))));
        var id=Id(Doc(created));var d=await Post(c,t.Root+"/"+id+"/start-inspection",new{version=Version(Doc(created))},HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/"+id+"/confirm",new{version=Version(Doc(d))})).StatusCode);
        r.Version=Version(Doc(d));r.Lines[0].ExpectedQuantity=20;d=await Post(c,t.Root+"/"+id,r,HttpStatusCode.OK);Assert.Equal("Planned",Doc(d).GetProperty("status").GetString());Assert.Equal(Id(Doc(created)),Id(Doc(d)));
        d=await Post(c,t.Root+"/"+id+"/cancel",new{version=Version(Doc(d))},HttpStatusCode.OK);Assert.Equal("Cancelled",Doc(d).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id+"/confirm",new{version=Version(Doc(d))})).StatusCode);
        using var scope=f.Services.CreateScope();Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.ToListAsync());
    }
    [Fact]
    public async Task PermissionsTenantIsolationChoicesAndSearch()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s);var id=Id(Doc(d));
        foreach(var kind in new[]{"products","partners","warehouses","locations"}){var choice=await c.GetAsync(t.Root+"/choices?kind="+kind+"&search="+Uri.EscapeDataString(kind=="products"?"상품":"")+"&warehouseId="+s.Warehouse);Assert.True(choice.IsSuccessStatusCode,await choice.Content.ReadAsStringAsync());}
        foreach(var term in new[]{"BULK","중량","매입처",Doc(d).GetProperty("number").GetString()!})Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?search="+Uri.EscapeDataString(term))).GetProperty("total").GetInt32());
        await Login(c,t,"Reader");foreach(var action in new[]{"confirm","cancel","start-inspection","inspection","placements"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root+"/"+id+"/"+action,new{version=Version(Doc(d))})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root,Request(s))).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/receipts/{id}")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/receipts/{id}/stock")).StatusCode);
    }
    [Fact]
    public async Task DatabaseFailureAfterStockInsertRollsBackStateAuditAndInventory()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s,true);var id=Id(Doc(d));
        using(var scope=f.Services.CreateScope())
        {
            var service=scope.ServiceProvider.GetRequiredService<ReceiptService>();
            // Invalid audit actor forces a DB foreign-key error in the same save as stock and state.
            await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>service.Confirm(t.Tenant,Guid.NewGuid(),id,new(){Version=Version(Doc(d))},CancellationToken.None));
        }
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.StockBalances.ToListAsync());Assert.Empty(await db.StockMovements.ToListAsync());Assert.Equal(0,await db.ReceiptChanges.CountAsync(x=>x.Action=="Confirmed"));
        var doc=await db.InboundReceipts.SingleAsync(x=>x.Id==id);Assert.Equal("Inspecting",doc.Status);Assert.Equal(Version(Doc(d)),doc.Version);
    }

    [Fact]
    public async Task PlacementOnlyUpdatesAdvanceVersionAndRejectStaleEdits()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s);var id=Id(Doc(d));
        var body=new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=s.Location,quantity=9.25m}}}}};
        var saved=await Post(c,t.Root+"/"+id+"/placements",body,HttpStatusCode.OK);Assert.NotEqual(Version(Doc(d)),Version(Doc(saved)));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id+"/placements",body)).StatusCode);
        Assert.Equal("FLOOR-1",Line(saved).GetProperty("placements")[0].GetProperty("locationCode").GetString());
    }

}
