using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class WarehousePlanTests
{
    private sealed record Fixture(Guid Tenant,Guid Foreign,Guid Warehouse,Guid OtherWarehouse,Guid Rack,Guid Location,string Password);
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var t=new Tenant{Code="PLAN",Name="도면 기업",BillingStatus=TenantBillingStatus.Paid};var other=new Tenant{Code="FOREIGN",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};
        string password="plan1!"+Guid.NewGuid().ToString("N");
        foreach(var role in new[]{TenantRole.Master,TenantRole.Administrator,TenantRole.Employee}){var u=new ApplicationUser{UserName=role.ToString(),Email=role+"@plan.test",DisplayName=role.ToString()};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.Add(new TenantMembership{Tenant=t,User=u,Role=role});}
        db.Add(other);var w=new Warehouse{TenantId=t.Id,Code="WH-0001",Name="본 창고"};var w2=new Warehouse{TenantId=t.Id,Code="WH-0002",Name="별도 창고"};db.AddRange(w,w2);
        var r=new WarehouseRack{TenantId=t.Id,WarehouseId=w.Id,Code="A01",Name="첫 랙",Levels=3,Bays=4};db.Add(r);Guid location=default;
        for(int l=1;l<=3;l++)for(int bay=1;bay<=4;bay++){var s=new StorageLocation{TenantId=t.Id,WarehouseId=w.Id,RackId=r.Id,Level=l,Bay=bay,Code=$"A01-{l}-{bay}",Name=$"{l}단 {bay}칸"};db.Add(s);location=s.Id;}
        await db.SaveChangesAsync();return new(t.Id,other.Id,w.Id,w2.Id,r.Id,location,password);
    }
    private static string Root(Fixture f)=>$"/api/tenants/{f.Tenant}/warehouses/{f.Warehouse}";
    private static async Task Login(HttpClient c,Fixture fixture,string role="Master") {var password=fixture.Password;Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=role,password})).StatusCode);}
    private static PlanObjectDto Object(Guid? rack=null,Guid? location=null)=>new(){Id=Guid.NewGuid(),Type=rack!=null?"rack":"shape",Label="도면 객체",X=.4,Y=.5,Width=.2,Height=.1,Rotation=30,RackId=rack,LocationId=location};
    private static SaveWarehousePlanRequest Request(params PlanObjectDto[] objects)=>new(){Objects=objects.ToList()};
    [Fact]
    public async Task BlankReadDoesNotWriteAndRoundTripPreservesPhysicalIdsCodesAndAudit()
    {
        using var f=new AuthFactory();using var c=f.Client();var fixture=await Seed(f);await Login(c,fixture);var url=Root(fixture);
        var empty=await c.GetFromJsonAsync<JsonElement>(url+"/plan");Assert.False(empty.GetProperty("exists").GetBoolean());
        using(var s=f.Services.CreateScope())Assert.Empty(await s.ServiceProvider.GetRequiredService<WmsDbContext>().WarehousePlans.ToListAsync());
        var request=Request(Object(fixture.Rack,fixture.Location),Object());var saved=await AuthTests.Post(c,url+"/plan",request);Assert.Equal(HttpStatusCode.OK,saved.StatusCode);var data=await saved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2,data.GetProperty("objects").GetArrayLength());Assert.Equal(.4,data.GetProperty("objects")[0].GetProperty("x").GetDouble());request.Version=data.GetProperty("version").GetGuid();request.Objects[0].X=.75;request.Objects[0].Rotation=-90;request.Objects.RemoveAt(1);
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,url+"/plan",request)).StatusCode);var loaded=await c.GetFromJsonAsync<JsonElement>(url+"/plan");Assert.Single(loaded.GetProperty("objects").EnumerateArray());Assert.Equal(.75,loaded.GetProperty("objects")[0].GetProperty("x").GetDouble());
        var front=await c.GetFromJsonAsync<JsonElement>(url+$"/racks/{fixture.Rack}/front");Assert.Equal(12,front.GetProperty("locations").GetArrayLength());Assert.False(front.GetProperty("inventoryAvailable").GetBoolean());
        Assert.Equal(3,front.GetProperty("rack").GetProperty("levels").GetInt32());Assert.Equal(4,front.GetProperty("rack").GetProperty("bays").GetInt32());
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(12,await db.StorageLocations.CountAsync());var loc=await db.StorageLocations.SingleAsync(x=>x.Id==fixture.Location);Assert.Equal("A01-3-4",loc.Code);Assert.Equal(fixture.Rack,loc.RackId);
        var audit=await db.WarehouseChanges.Where(x=>x.Action=="PlanSaved").ToListAsync();Assert.Equal(2,audit.Count);Assert.Contains("0.75",audit[1].AfterJson);Assert.Contains("0.4",audit[1].BeforeJson);Assert.All(audit,a=>Assert.NotEqual(Guid.Empty,a.ChangedByUserId));
    }
    [Fact]
    public async Task ConflictKeepsSavedLayoutAndHistoryIntact()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var request=Request(Object());Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,Root(t)+"/plan",request)).StatusCode);
        request.Objects[0].Label="stale";Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/plan",request)).StatusCode);
        var history=await c.GetFromJsonAsync<JsonElement>(Root(t)+"/plan/history");Assert.Single(history.EnumerateArray());Assert.Equal("도면 객체",(await c.GetFromJsonAsync<JsonElement>(Root(t)+"/plan")).GetProperty("objects")[0].GetProperty("label").GetString());
    }
    [Theory]
    [InlineData("type")][InlineData("x")][InlineData("width")][InlineData("duplicate")][InlineData("rack")][InlineData("location")][InlineData("color")][InlineData("count")][InlineData("schema")]
    public async Task InvalidDocumentsAreRejectedWithoutWrites(string mode)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var obj=Object();var req=Request(obj);
        switch(mode){case "type":obj.Type="script";break;case "x":obj.X=1.2;break;case "width":obj.Width=0;break;case "duplicate":req.Objects.Add(obj);break;case "rack":obj.Type="rack";obj.RackId=Guid.NewGuid();break;case "location":obj.LocationId=Guid.NewGuid();break;case "color":obj.Fill="url(example)";break;case "count":req.Objects=Enumerable.Range(0,501).Select(_=>Object()).ToList();break;case "schema":req.SchemaVersion=2;break;}
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,Root(t)+"/plan",req)).StatusCode);using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.WarehousePlans.ToListAsync());Assert.Empty(await db.WarehouseChanges.ToListAsync());
    }
    [Fact]
    public async Task TenantWarehouseReferencesPermissionsAndCsrfAreEnforced()
    {
        using var f=new AuthFactory();using var master=f.Client();using var staff=f.Client();using var admin=f.Client();var t=await Seed(f);await Login(master,t);await Login(staff,t,"Employee");await Login(admin,t,"Administrator");
        var request=Request(Object(t.Rack));Assert.Equal(HttpStatusCode.BadRequest,(await master.PostAsJsonAsync(Root(t)+"/plan",request)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(staff,Root(t)+"/plan",request)).StatusCode);Assert.Equal(HttpStatusCode.OK,(await staff.GetAsync(Root(t)+"/plan")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await master.GetAsync($"/api/tenants/{t.Foreign}/warehouses/{t.Warehouse}/plan")).StatusCode);
        var second=$"/api/tenants/{t.Tenant}/warehouses/{t.OtherWarehouse}";Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(master,second+"/plan",request)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await master.GetAsync(second+$"/racks/{t.Rack}/front")).StatusCode);
        var permissions=await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/permissions");var roles=JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string[]>>>(permissions.GetProperty("roles").GetRawText())!;roles["Administrator"]["warehouses"]=["menu","read"];
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(master,$"/api/tenants/{t.Tenant}/permissions",new{version=permissions.GetProperty("version").GetGuid(),roles})).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(admin,Root(t)+"/plan",request)).StatusCode);
    }
    [Fact]
    public async Task AuditFailureRollsBackPlanAndObjects()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        using(var s=f.Services.CreateScope()){var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_plan_audit BEFORE INSERT ON WarehouseChanges WHEN NEW.Action = 'PlanSaved' BEGIN SELECT RAISE(ABORT, 'Simulated audit failure'); END;");}
        Assert.Equal(HttpStatusCode.InternalServerError,(await AuthTests.Post(c,Root(t)+"/plan",Request(Object()))).StatusCode);
        using var verify=f.Services.CreateScope();var final=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await final.WarehousePlans.ToListAsync());Assert.Empty(await final.WarehousePlanObjects.ToListAsync());Assert.Empty(await final.WarehouseChanges.ToListAsync());
    }

    private static async Task<JsonElement> Created(HttpClient c, string url, object body)
    {
        var response = await AuthTests.Post(c, url, body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    [Fact]
    public async Task IntegratedCreationReplaySaveReloadAndVisualDeletionPreservePhysicalStructure()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Created(c, $"/api/tenants/{t.Tenant}/warehouses", new { name = "도면 통합 창고", requestId = Guid.NewGuid() });
        var warehouse = w.GetProperty("id").GetGuid(); var root = $"/api/tenants/{t.Tenant}/warehouses/{warehouse}";
        Assert.False((await c.GetFromJsonAsync<JsonElement>(root + "/plan")).GetProperty("exists").GetBoolean());
        var zoneRequest = new { name = "구역 A", code = "a", requestId = Guid.NewGuid() };
        var z = await Created(c, root + "/zones", zoneRequest);
        Assert.Equal(z.GetProperty("id").GetGuid(), (await Created(c, root + "/zones", zoneRequest)).GetProperty("id").GetGuid());
        var zoneId = z.GetProperty("id").GetGuid();
        var rackRequest = new { name = "랙 A", code = "R-A", levels = 3, bays = 4, zoneId, requestId = Guid.NewGuid() };
        var r = await Created(c, root + "/racks", rackRequest);
        var rackId = r.GetProperty("id").GetGuid();
        Assert.Equal(rackId, (await Created(c, root + "/racks", rackRequest)).GetProperty("id").GetGuid());
        var locations = (await c.GetFromJsonAsync<JsonElement>(root + "/locations")).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("location").GetProperty("id").GetGuid()).Order().ToArray();
        Assert.Equal(12, locations.Length);
        Assert.False((await c.GetFromJsonAsync<JsonElement>(root + "/plan")).GetProperty("exists").GetBoolean());
        var zone = Object(); zone.Type = "zone"; zone.ZoneId = zoneId;
        var request = Request(zone, Object(rackId));
        request.Version = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/plan", request)).StatusCode);
        // Failed layout save cannot roll back or duplicate separately committed physical creation.
        Assert.Equal(rackId, (await Created(c, root + "/racks", rackRequest)).GetProperty("id").GetGuid());
        request.Version = Guid.Empty;
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root + "/plan", request)).StatusCode);
        var saved = await c.GetFromJsonAsync<JsonElement>(root + "/plan");
        Assert.Equal(zoneId, saved.GetProperty("objects")[0].GetProperty("zoneId").GetGuid());
        Assert.Equal(rackId, saved.GetProperty("objects")[1].GetProperty("rackId").GetGuid());
        var front = await c.GetFromJsonAsync<JsonElement>(root + $"/racks/{rackId}/front");
        Assert.Equal(12, front.GetProperty("locations").GetArrayLength());
        Assert.False(front.GetProperty("inventoryAvailable").GetBoolean());
        request.Version = saved.GetProperty("version").GetGuid(); request.Objects.Clear();
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root + "/plan", request)).StatusCode);
        var after = await c.GetFromJsonAsync<JsonElement>(root);
        Assert.Single(after.GetProperty("zones").EnumerateArray()); Assert.Single(after.GetProperty("racks").EnumerateArray());
        Assert.Equal(locations, (await c.GetFromJsonAsync<JsonElement>(root + "/locations")).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("location").GetProperty("id").GetGuid()).Order().ToArray());
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1, await db.WarehouseChanges.CountAsync(x => x.WarehouseId == warehouse && x.Action == "ZoneCreated"));
        Assert.Equal(1, await db.WarehouseChanges.CountAsync(x => x.WarehouseId == warehouse && x.Action == "RackCreated"));
    }
    [Theory]
    [InlineData("zones")][InlineData("racks")]
    public async Task CreationRequestCannotBeReusedForDifferentPayloadAndCodesStayUnique(string kind)
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var root = Root(t); var requestId = Guid.NewGuid();
        await Created(c, root + "/" + kind, new { code = "REPLAY", name = "최초", requestId });
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/" + kind, new { code = "CHANGED", name = "다른 내용", requestId })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/" + kind, new { code = "replay", name = "중복", requestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/" + kind, new { code = "EMPTY", name = "오류", requestId = Guid.Empty })).StatusCode);
    }
    [Fact]
    public async Task ZoneLinksAreScopedTypedAndRackLinksMustBeUnique()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var foreignZone = await Created(c, $"/api/tenants/{t.Tenant}/warehouses/{t.OtherWarehouse}/zones", new { code = "OTHER", name = "다른 창고" });
        var zone = Object(); zone.Type = "zone"; zone.ZoneId = foreignZone.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Root(t) + "/plan", Request(zone))).StatusCode);
        var own = await Created(c, Root(t) + "/zones", new { code = "OWN", name = "자기 창고" });
        zone.ZoneId = own.GetProperty("id").GetGuid(); zone.Type = "shape";
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Root(t) + "/plan", Request(zone))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Root(t) + "/plan", Request(Object(t.Rack), Object(t.Rack)))).StatusCode);
        zone.Type = "zone";
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Root(t) + "/plan", Request(zone, Object(t.Rack)))).StatusCode);
    }
    [Fact]
    public async Task CreateAndUpdatePermissionsAreIndependentInIntegratedWorkflow()
    {
        using var f = new AuthFactory(); using var master = f.Client(); using var admin = f.Client(); var t = await Seed(f); await Login(master, t); await Login(admin, t, "Administrator");
        async Task Grants(params string[] grants) {
            var current = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/permissions");
            var roles = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(current.GetProperty("roles").GetRawText())!;
            roles["Administrator"]["warehouses"] = grants;
            Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, $"/api/tenants/{t.Tenant}/permissions", new { version = current.GetProperty("version").GetGuid(), roles })).StatusCode);
        }
        await Grants("menu", "read", "create");
        var w = await Created(admin, $"/api/tenants/{t.Tenant}/warehouses", new { name = "도면 없이 등록" });
        var root = $"/api/tenants/{t.Tenant}/warehouses/{w.GetProperty("id").GetGuid()}";
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, root + "/plan", Request(Object()))).StatusCode);
        Assert.False((await admin.GetFromJsonAsync<JsonElement>(root + "/plan")).GetProperty("exists").GetBoolean());
        await Grants("menu", "read", "update");
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, root + "/zones", new { code = "NO", name = "권한 없음" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, root + "/racks", new { code = "NO", name = "권한 없음" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(admin, root + "/plan", Request(Object()))).StatusCode);
    }
}
