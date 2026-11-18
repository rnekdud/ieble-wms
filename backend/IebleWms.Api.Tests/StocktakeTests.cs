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

public sealed partial class StocktakeTests
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
    static string CountsRoot(Fixture t)=>$"/api/tenants/{t.Tenant}/stocktakes";
    static JsonElement Document(JsonElement d)=>d.GetProperty("document");
    static async Task<JsonElement> CreateCount(HttpClient c,Fixture t,Structure s,string scope="Warehouse",Guid? scopeId=null)=>await Post(c,CountsRoot(t),new StocktakeRequest{RequestId=Guid.NewGuid(),Name="정기 실사",WarehouseId=s.Warehouse,Scope=scope,ScopeId=scopeId,BasisAt=DateTimeOffset.UtcNow});
    static async Task<JsonElement> Step(HttpClient c,Fixture t,JsonElement d,string action)=>await Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/"+action,new{version=Version(Document(d))},HttpStatusCode.OK);
    static async Task<JsonElement[]> Items(HttpClient c,Fixture t,JsonElement d)=>(await c.GetFromJsonAsync<JsonElement>(CountsRoot(t)+"/"+Id(Document(d))+"/items")).GetProperty("items").EnumerateArray().ToArray();
    static async Task<JsonElement> Count(HttpClient c,Fixture t,JsonElement d,decimal? qty,string? reason="실물 확인",string? serial=null)
    {var items=await Items(c,t,d);return await Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/counts",new{version=Version(Document(d)),items=items.Select(x=>new{targetId=Id(x),quantity=qty,reason,observedSerial=serial}).ToArray()},HttpStatusCode.OK);}
    static async Task<JsonElement> Reviewing(HttpClient c,Fixture t,JsonElement d,decimal qty){d=await Step(c,t,d,"start");d=await Count(c,t,d,qty);d=await Step(c,t,d,"complete");return await Step(c,t,d,"review");}
    [Fact]
    public async Task SnapshotNullZeroAndFinalizationOnlyOnce()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);
        var d=await CreateCount(c,t,s);var original=(await Items(c,t,d))[0];Assert.Equal(9.25m,original.GetProperty("originalQuantity").GetDecimal());Assert.Equal(JsonValueKind.Null,original.GetProperty("countedQuantity").ValueKind);
        d=await Step(c,t,d,"start");Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/complete",new{version=Version(Document(d))})).StatusCode);
        d=await Count(c,t,d,0);Assert.Equal(0,d.GetProperty("summary").GetProperty("missing").GetInt32());Assert.Equal(9.25m,(await Stock(c,t,s.Bulk)).GetProperty("quantity").GetDecimal());
        d=await Step(c,t,d,"complete");d=await Step(c,t,d,"review");d=await Step(c,t,d,"confirm");await Step(c,t,d,"confirm");Assert.Equal(0,(await Stock(c,t,s.Bulk)).GetProperty("quantity").GetDecimal());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.StockMovements.CountAsync());Assert.Equal(1,await db.StocktakeChanges.CountAsync(x=>x.Action=="Applied"));Assert.Equal(9.25m,(await db.StocktakeTargets.SingleAsync()).OriginalQuantity);
    }
    [Fact]
    public async Task ConflictReconfirmationPreservesOriginalAndRecountHistory()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Reviewing(c,t,await CreateCount(c,t,s),8);
        var stock=await Stock(c,t,s.Bulk);var r=Input(stock,2);r.Increase=true;await Post(c,Inventory(t)+"/adjust",r);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/confirm",new{version=Version(Document(d))})).StatusCode);
        d=await Step(c,t,d,"reconfirm");var row=(await Items(c,t,d))[0];Assert.Equal(9.25m,row.GetProperty("originalQuantity").GetDecimal());Assert.Equal(11.25m,row.GetProperty("baselineQuantity").GetDecimal());Assert.Equal(JsonValueKind.Null,row.GetProperty("countedQuantity").ValueKind);
        d=await Count(c,t,d,10);d=await Step(c,t,d,"complete");d=await Step(c,t,d,"review");d=await Step(c,t,d,"confirm");Assert.Equal(10,(await Stock(c,t,s.Bulk)).GetProperty("quantity").GetDecimal());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.StocktakeChanges.CountAsync(x=>x.Action=="Count"));Assert.Single(await db.StocktakeChanges.Where(x=>x.Action=="Rebased").ToListAsync());
    }
    [Fact]
    public async Task ReservationsReasonsAndStateSequenceProtectStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);await Post(c,Root(t),OutRequest(s,6));var d=await CreateCount(c,t,s);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/confirm",new{version=Version(Document(d))})).StatusCode);
        d=await Reviewing(c,t,d,5);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/confirm",new{version=Version(Document(d))})).StatusCode);
        d=await Count(c,t,d,7,null);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/confirm",new{version=Version(Document(d))})).StatusCode);
        d=await Count(c,t,d,7);d=await Step(c,t,d,"confirm");var row=await Stock(c,t,s.Bulk);Assert.Equal(7,row.GetProperty("quantity").GetDecimal());Assert.Equal(6,row.GetProperty("reservedQuantity").GetDecimal());
    }
    [Fact]
    public async Task FoundSerialDoesNotCreateStockUntilConfirmAndRejectsDuplicates()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Step(c,t,await CreateCount(c,t,s),"start");var path=CountsRoot(t)+"/"+Id(Document(d));
        var request=new StocktakeFoundRequest{Version=Version(Document(d)),RequestId=Guid.NewGuid(),ProductId=s.Serial,LocationId=s.Location,Quantity=1,LotNumber="LOT",ExpiryDate=new(2027,1,1),SerialNumber="FOUND",Reason="입고 누락"};d=await Post(c,path+"/found",request,HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope())Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.ToListAsync());
        request.Version=Version(Document(d));request.RequestId=Guid.NewGuid();Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/found",request)).StatusCode);
        var row=(await Items(c,t,d))[0];Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,path+"/counts",new{version=Version(Document(d)),items=new[]{new{targetId=Id(row),quantity=1}}})).StatusCode);
        d=await Step(c,t,d,"complete");d=await Step(c,t,d,"review");d=await Step(c,t,d,"confirm");Assert.Equal("FOUND",(await Stock(c,t,s.Serial)).GetProperty("serialNumber").GetString());
    }
    [Fact]
    public async Task NewIncomingStockAndMovedOutRowsRequireRecount()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Reviewing(c,t,await CreateCount(c,t,s,"Location",s.Location),9.25m);var target=await Target(f,t,s);var r=Input(await Stock(c,t,s.Bulk),9.25m);r.WarehouseId=s.Warehouse;r.LocationId=target.location;await Post(c,Inventory(t)+"/move",r);await Receive(c,t,s);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/confirm",new{version=Version(Document(d))})).StatusCode);d=await Step(c,t,d,"reconfirm");Assert.Equal(2,d.GetProperty("summary").GetProperty("missing").GetInt32());
    }
    [Theory][InlineData("Warehouse")][InlineData("Zone")][InlineData("Rack")][InlineData("Location")]
    public async Task ScopesPermissionsIsolationAndIdempotentRegistration(string kind)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);Guid? scopeId=null;
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var z=new WarehouseZone{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="Z",Name="구역"};var rack=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,ZoneId=z.Id,Code="R",Name="랙",Levels=1,Bays=1};db.AddRange(z,rack);var l=await db.StorageLocations.SingleAsync(x=>x.Id==s.Location);l.RackId=rack.Id;l.Level=1;l.Bay=1;await db.SaveChangesAsync();scopeId=kind switch{"Zone"=>z.Id,"Rack"=>rack.Id,"Location"=>s.Location,_=>null};}
        var req=new StocktakeRequest{RequestId=Guid.NewGuid(),Name="범위 검증",WarehouseId=s.Warehouse,Scope=kind,ScopeId=scopeId,BasisAt=DateTimeOffset.UtcNow};var d=await Post(c,CountsRoot(t),req);Assert.Equal(Id(Document(d)),Id(Document(await Post(c,CountsRoot(t),req))));Assert.Single(await Items(c,t,d));
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(CountsRoot(t))).StatusCode);foreach(var action in new[]{"start","counts","review","confirm","found","cancel"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/"+action,new{version=Version(Document(d))})).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(CountsRoot(t))).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/stocktakes/{Id(Document(d))}")).StatusCode);
    }
    [Fact]
    public async Task FinalizationFailureRollsBackStockDocumentLedgerAndAudit()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await Reviewing(c,t,await CreateCount(c,t,s),8);
        using(var scope=f.Services.CreateScope()){var svc=scope.ServiceProvider.GetRequiredService<IebleWms.Api.Inventory.StocktakeService>();await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>svc.Action(t.Tenant,Guid.NewGuid(),Id(Document(d)),"confirm",new(){Version=Version(Document(d))},default));}
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(9.25m,(await db.StockBalances.SingleAsync()).Quantity);Assert.Single(await db.StockMovements.ToListAsync());Assert.Equal("Reviewing",(await db.Stocktakes.SingleAsync()).Status);Assert.Empty(await db.StocktakeChanges.Where(x=>x.Action=="Applied").ToListAsync());
    }

    [Fact]
    public async Task CountOnlyEmployeeCannotReviewOrChangeActualStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var d=await CreateCount(c,t,s);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var grants=PermissionCatalog.Defaults();grants["Employee"]["stocktake"]=["menu","read","count"];db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(grants),Version=Guid.NewGuid(),UpdatedAt=DateTimeOffset.UtcNow,UpdatedByUserId=t.Actor});await db.SaveChangesAsync();}
        await Login(c,t,"Reader");d=await Step(c,t,d,"start");d=await Count(c,t,d,8);d=await Step(c,t,d,"complete");foreach(var action in new[]{"review","confirm","cancel"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(d))+"/"+action,new{version=Version(Document(d))})).StatusCode);
        Assert.Equal(9.25m,(await Stock(c,t,s.Bulk)).GetProperty("quantity").GetDecimal());
    }
    [Fact]
    public async Task MatchingFinalizationInvalidatesOtherBaselineAndHistoryIsImmutable()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);var first=await Reviewing(c,t,await CreateCount(c,t,s),9.25m);var second=await Reviewing(c,t,await CreateCount(c,t,s),9.25m);await Step(c,t,first,"confirm");
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,CountsRoot(t)+"/"+Id(Document(second))+"/confirm",new{version=Version(Document(second))})).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await db.StockMovements.ToListAsync());var target=await db.StocktakeTargets.FirstAsync();target.OriginalQuantity=999;await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());}
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var change=await db.StocktakeChanges.FirstAsync();change.Action="tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());}
    }
    [Fact]
    public async Task SerialMovedOutsideScopeIsExcludedWithoutErasingOriginalHistory()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);var d=await CreateCount(c,t,s);var original=await Items(c,t,d);d=await Step(c,t,d,"start");var stock=await Stock(c,t,s.Serial);var target=await Target(f,t,s,true);var move=Input(stock,1);move.WarehouseId=target.warehouse;move.LocationId=target.location;await Post(c,Inventory(t)+"/move",move);d=await Step(c,t,d,"reconfirm");Assert.Single(await Items(c,t,d));
        var excluded=(await c.GetFromJsonAsync<JsonElement>(CountsRoot(t)+"/"+Id(Document(d))+"/items?state=excluded")).GetProperty("items");Assert.Equal(1,excluded.GetArrayLength());Assert.Equal(1,excluded[0].GetProperty("originalQuantity").GetDecimal());Assert.Equal(2,original.Length);
    }

    [Fact]
    public async Task PeriodFilterUsesKoreanBusinessDateAcrossUtcMidnight()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var basis=new DateTimeOffset(DateTime.UtcNow.Date.AddDays(-1).AddHours(16),TimeSpan.Zero);var local=DateOnly.FromDateTime(basis.ToOffset(TimeSpan.FromHours(9)).Date);
        await Post(c,CountsRoot(t),new StocktakeRequest{RequestId=Guid.NewGuid(),Name="자정 기준일",WarehouseId=s.Warehouse,BasisAt=basis});var result=await c.GetFromJsonAsync<JsonElement>(CountsRoot(t)+$"?from={local:yyyy-MM-dd}&to={local:yyyy-MM-dd}");Assert.Equal(1,result.GetProperty("total").GetInt32());
    }
}
