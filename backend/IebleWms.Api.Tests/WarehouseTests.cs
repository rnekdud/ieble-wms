using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class WarehouseTests
{
    private sealed record Fixture(Guid Tenant, Guid Other, Guid Master, string Password);
    private static async Task<Fixture> Seed(AuthFactory f)
    {
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "STORE", Name = "물류 기업", BillingStatus = TenantBillingStatus.Paid };
        var other = new Tenant { Code = "OTHER", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid };
        var password = "seed1!" + Guid.NewGuid().ToString("N"); Guid master = default;
        foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee })
        {
            var u = new ApplicationUser { UserName = role.ToString(), Email = role + "@warehouse.test", DisplayName = role.ToString() };
            Assert.True((await users.CreateAsync(u, password)).Succeeded); if (role == TenantRole.Master) master = u.Id;
            db.Add(new TenantMembership { Tenant = tenant, User = u, Role = role });
        }
        db.Add(other); await db.SaveChangesAsync(); return new(tenant.Id, other.Id, master, password);
    }
    private static string Url(Fixture f) => $"/api/tenants/{f.Tenant}/warehouses";
    private static async Task Login(HttpClient c, Fixture f, string role = "Master") => Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/login", new { email = role, password = f.Password })).StatusCode);
    private static object Item(string code, Guid version = default, bool active = true) => new { code, name = code + " 이름", version, isActive = active };
    private static async Task<JsonElement> Create(HttpClient c, string url, object body)
    {
        var response = await AuthTests.Post(c, url, body); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static Guid Id(JsonElement item) => item.GetProperty("id").GetGuid();
    private static Guid Version(JsonElement item) => item.GetProperty("version").GetGuid();
    private static async Task<JsonElement> Locations(HttpClient c, string root) => await c.GetFromJsonAsync<JsonElement>(root + "/locations");

    [Theory]
    [InlineData(false, false, false)]
    [InlineData(false, true, true)]
    [InlineData(true, true, false)]
    public async Task DevelopmentPreviewRequiresOptInAndPreservesBillingOtherFeaturesAndRolePermissions(bool production, bool enabled, bool allowed)
    {
        using var f = new AuthFactory(production: production, warehouseSetup: enabled); using var c = f.Client(); using var employee = f.Client();
        var t = await Seed(f);
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.FindAsync(t.Tenant))!.BillingStatus = TenantBillingStatus.CardRequired;
            await db.SaveChangesAsync();
        }
        await Login(c, t); await Login(employee, t, "Employee");
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await c.GetAsync(Url(t))).StatusCode);
        Assert.Equal(allowed ? HttpStatusCode.Created : HttpStatusCode.Forbidden, (await AuthTests.Post(c, Url(t), Item("DEV"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, Url(t), Item("NO"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync($"/api/tenants/{t.Tenant}/pages/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync($"/api/tenants/{t.Tenant}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync($"/api/tenants/{t.Other}/warehouses")).StatusCode);
        var workspace = await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/workspace");
        Assert.Equal(allowed, workspace.GetProperty("warehouseSetupPreview").GetBoolean());
        Assert.Equal("CardRequired", workspace.GetProperty("billingStatus").GetString());
        Assert.False(workspace.GetProperty("billingAccess").GetProperty("canAccessWms").GetBoolean());
        Assert.False(workspace.GetProperty("billingAccess").GetProperty("hasRegisteredCard").GetBoolean());
        using var verify = f.Services.CreateScope(); var db2 = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(TenantBillingStatus.CardRequired, (await db2.Tenants.FindAsync(t.Tenant))!.BillingStatus);
        var policy = verify.ServiceProvider.GetRequiredService<IebleWms.Api.Warehousing.WarehouseSetupAccess>();
        Assert.False(policy.AllowsWithoutCard(new Tenant { CreatedAt = DateTimeOffset.UtcNow, BillingStatus = TenantBillingStatus.CardRequired, ServiceStatus = TenantServiceStatus.Suspended }));
        Assert.False(policy.AllowsWithoutCard(new Tenant { CreatedAt = DateTimeOffset.UtcNow, BillingStatus = TenantBillingStatus.CardRequired, IsActive = false }));
        Assert.False(policy.AllowsWithoutCard(new Tenant { CreatedAt = DateTimeOffset.UtcNow.AddMonths(-2), BillingStatus = TenantBillingStatus.PaymentRequired }));
    }

    [Fact]
    public async Task WarehouseCrudNormalizesUniqueCodesFiltersStatusAndRecordsImmutableActorHistory()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Create(c, Url(t), new { name = "중앙 창고", customCode = " w01 ", type = "일반/상온", address = "서울", addressDetail = "1층", contactName = "담당자", notes = "취급 주의" });
        Assert.Equal("WH-0001", w.GetProperty("code").GetString());
        Assert.Equal("w01", w.GetProperty("customCode").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Url(t), new { name = "중복", customCode = "W01" })).StatusCode);
        var updated = await AuthTests.Post(c, Url(t) + $"/{Id(w)}", new { name = "수정 창고", customCode = "W02", version = Version(w), isActive = false, contactName = "변경 담당" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Url(t) + $"/{Id(w)}", new { name = "오래된 수정", version = Version(w) })).StatusCode);
        var list = await c.GetFromJsonAsync<JsonElement>(Url(t) + "?search=w02&status=inactive"); Assert.Equal(1, list.GetProperty("total").GetInt32());
        var none = await c.GetFromJsonAsync<JsonElement>(Url(t) + "?status=active"); Assert.Equal(0, none.GetProperty("total").GetInt32());
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var history = await db.WarehouseChanges.ToListAsync(); Assert.Equal(2, history.Count); Assert.All(history, a => { Assert.Equal(t.Master, a.ChangedByUserId); Assert.Equal(t.Tenant, a.TenantId); Assert.True(a.ChangedAt > DateTimeOffset.UtcNow.AddMinutes(-5)); });
        Assert.Contains("w01", history[1].BeforeJson); Assert.Contains("W02", history[1].AfterJson);
        var entity = await db.Warehouses.SingleAsync(); Assert.Equal(t.Master, entity.CreatedByUserId); Assert.Equal(t.Master, entity.UpdatedByUserId);
        history[0].AfterJson = "{}"; await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
    [Fact]
    public async Task RackGeneratesTwelveSlotsAndExpansionPreservesPhysicalIdsAndRenamedCodes()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Create(c, Url(t), Item("W01")); var root = Url(t) + $"/{Id(w)}";
        var z = await Create(c, root + "/zones", Item("A"));
        var rack = await Create(c, root + "/racks", new { code = "A-01", name = "물류 랙", zoneId = Id(z), levels = 3, bays = 4 });
        var locations = (await Locations(c, root)).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("location")).ToArray();
        Assert.Equal(12, locations.Length); Assert.Equal(12, locations.Select(Id).Distinct().Count());
        Assert.Contains(locations, x => x.GetProperty("code").GetString() == "A-01-L03-B04");
        Assert.All(locations, x => { Assert.Equal(Id(rack), x.GetProperty("rackId").GetGuid()); Assert.Equal(JsonValueKind.Null, x.GetProperty("zoneId").ValueKind); });
        var first = locations[0]; Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root + $"/locations/{Id(first)}", Item("CUSTOM", Version(first)))).StatusCode);
        var expanded = await AuthTests.Post(c, root + $"/racks/{Id(rack)}", new { code = "A-NEW", name = "확장 랙", zoneId = Id(z), levels = 4, bays = 5, version = Version(rack) });
        Assert.Equal(HttpStatusCode.OK, expanded.StatusCode);
        var latest = await expanded.Content.ReadFromJsonAsync<JsonElement>();
        var all = (await Locations(c, root)).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("location")).ToArray();
        Assert.Equal(20, all.Length); Assert.All(locations, x => Assert.Contains(all, y => Id(y) == Id(x)));
        Assert.Contains(all, x => Id(x) == Id(first) && x.GetProperty("code").GetString() == "CUSTOM");
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + $"/racks/{Id(rack)}", new { code = "A-NEW", name = "축소", zoneId = Id(z), levels = 2, bays = 5, version = Version(latest) })).StatusCode);
        Assert.Equal(20, (await c.GetFromJsonAsync<JsonElement>(root + $"/locations?zoneId={Id(z)}")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await c.DeleteAsync(root + $"/locations/{Id(first)}")).StatusCode);
    }
    [Fact]
    public async Task GeneratedCodeCollisionRollsBackEntireRackAndAuditAndFloorLocationsNeedNoRackOrZone()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Create(c, Url(t), Item("W")); var root = Url(t) + $"/{Id(w)}";
        var floor = await Create(c, root + "/locations", Item("R-L01-B02"));
        Assert.Equal(JsonValueKind.Null, floor.GetProperty("rackId").ValueKind); Assert.Equal(JsonValueKind.Null, floor.GetProperty("zoneId").ValueKind);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/racks", new { code = "R", name = "충돌", levels = 3, bays = 4 })).StatusCode);
        var detail = await c.GetFromJsonAsync<JsonElement>(root); Assert.Empty(detail.GetProperty("racks").EnumerateArray()); Assert.Equal(1, detail.GetProperty("locationCount").GetInt32());
        var z = await Create(c, root + "/zones", Item("FLOOR"));
        var direct = await Create(c, root + "/locations", new { code = "F01", name = "바닥", zoneId = Id(z) });
        Assert.Equal(Id(z), direct.GetProperty("zoneId").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/locations", Item("f01"))).StatusCode);
        var other = await Create(c, Url(t), Item("W2")); await Create(c, Url(t) + $"/{Id(other)}/locations", Item("F01"));
        using var scope = f.Services.CreateScope(); Assert.False(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().WarehouseChanges.AnyAsync(x => x.Action == "RackCreated"));
    }
    [Fact]
    public async Task InactiveParentsPreserveChildFlagsButDisableEffectiveLocationsAndPreventNewAssignments()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Create(c, Url(t), Item("W")); var root = Url(t) + $"/{Id(w)}";
        var z = await Create(c, root + "/zones", Item("A")); var r = await Create(c, root + "/racks", new { code = "R", name = "랙", zoneId = Id(z), levels = 1, bays = 1 });
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root + $"/zones/{Id(z)}", Item("A", Version(z), false))).StatusCode);
        var row = (await Locations(c, root)).GetProperty("items")[0]; Assert.False(row.GetProperty("effectiveActive").GetBoolean()); Assert.True(row.GetProperty("location").GetProperty("isActive").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/locations", new { code = "F", name = "바닥", zoneId = Id(z) })).StatusCode);
        var detail = await c.GetFromJsonAsync<JsonElement>(root); var currentZone = detail.GetProperty("zones")[0];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root + $"/zones/{Id(z)}", Item("A", Version(currentZone)))).StatusCode);
        Assert.True((await Locations(c, root)).GetProperty("items")[0].GetProperty("effectiveActive").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, root, new { name = "미사용 창고", version = Version(w), isActive = false })).StatusCode);
        Assert.Equal(1, (await c.GetFromJsonAsync<JsonElement>(root + "/locations?status=inactive")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/zones", Item("B"))).StatusCode);
    }
    [Fact]
    public async Task TenantAndWarehouseCompositeForeignKeysBlockCrossScopeLinks()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var w = await Create(c, Url(t), Item("W")); var other = await Create(c, Url(t), Item("W2")); var root = Url(t) + $"/{Id(w)}";
        var z = await Create(c, Url(t) + $"/{Id(other)}/zones", Item("A"));
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/racks", new { code = "R", name = "랙", zoneId = Id(z), levels = 1, bays = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, root + $"/zones/{Id(z)}", Item("B", Version(z)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync($"/api/tenants/{t.Other}/warehouses")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"/api/tenants/{t.Other}/warehouses", Item("FOREIGN"))).StatusCode);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var foreign = new Warehouse { TenantId = t.Other, Code = "W", Name = "같은 코드 타사" }; db.Add(foreign); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync(Url(t) + $"/{foreign.Id}")).StatusCode);
        db.Add(new StorageLocation { TenantId = t.Tenant, WarehouseId = Id(w), ZoneId = Id(z), Code = "BAD", Name = "잘못된 참조" });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
    [Fact]
    public async Task ExistingPermissionsAndCsrfProtectEveryMutationAndPermissionChangesApplyImmediately()
    {
        using var f = new AuthFactory(); using var master = f.Client(); using var employee = f.Client(); using var admin = f.Client(); var t = await Seed(f);
        await Login(master, t); await Login(employee, t, "Employee"); await Login(admin, t, "Administrator");
        var w = await Create(master, Url(t), Item("W")); var root = Url(t) + $"/{Id(w)}";
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, Url(t), Item("NO"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, root, Item("NO", Version(w)))).StatusCode);
        foreach (var kind in new[] { "zones", "racks", "locations" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, root + "/" + kind, Item("NO"))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, root + $"/{kind}/{Guid.NewGuid()}", Item("NO"))).StatusCode);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await master.PostAsJsonAsync(Url(t), Item("CSRF"))).StatusCode);
        await Create(admin, root + "/zones", Item("ADMIN"));
        var setting = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/permissions");
        var roles = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(setting.GetProperty("roles").GetRawText())!;
        roles["Administrator"]["warehouses"] = ["menu", "read"]; roles["Employee"]["warehouses"] = [];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, $"/api/tenants/{t.Tenant}/permissions", new { roles, version = setting.GetProperty("version").GetGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, root, Item("NO", Version(w)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/locations")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await master.GetAsync(root)).StatusCode);
    }
    [Fact]
    public async Task AutomaticCodesSkipExistingCodesAndRequestReplayDoesNotCreateDuplicate()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        using(var scope=f.Services.CreateScope()) { var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.Add(new Warehouse{TenantId=t.Tenant,Name="기존 창고",Code="WH-0042",Type="기존 자유 유형"});await db.SaveChangesAsync(); }
        var requestId=Guid.NewGuid();var body=new {name="자동 창고",requestId,customCode=" own-1 ",type="기타",typeDescription="특수 분류"};
        var one=await Create(c,Url(t),body);var repeat=await Create(c,Url(t),body);
        Assert.Equal("WH-0043",one.GetProperty("code").GetString());Assert.Equal(Id(one),Id(repeat));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Url(t),new{name="중복",customCode="OWN-1"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,Url(t)+$"/{Id(one)}",new{name="변경",version=Version(one),code="WH-9999"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,Url(t),new{name="유형 오류",type="마음대로"})).StatusCode);
        using var verify=f.Services.CreateScope();var db2=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(2,await db2.Warehouses.CountAsync());Assert.Equal(1,await db2.WarehouseChanges.CountAsync());
        var legacy=await db2.Warehouses.SingleAsync(x=>x.Code=="WH-0042");
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,Url(t)+$"/{legacy.Id}",new{name="기존 수정",version=legacy.Version,type=legacy.Type})).StatusCode);
        await db2.Entry(legacy).ReloadAsync();Assert.Equal("WH-0042",legacy.Code);Assert.Equal("기존 자유 유형",legacy.Type);
    }

}
