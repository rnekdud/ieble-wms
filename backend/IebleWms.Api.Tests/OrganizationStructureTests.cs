using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class OrganizationStructureTests
{
    private sealed record Fixture(Guid Tenant, Guid Foreign, Guid Master, string Password);
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "STRUCTURE", Name = "조직", BillingStatus = TenantBillingStatus.Paid };
        var foreign = new Tenant { Code = "OTHER", Name = "다른 기업" }; Guid master = default; var password = "seed1!" + Guid.NewGuid().ToString("N");
        foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee })
        {
            var user = new ApplicationUser { UserName = role.ToString(), Email = $"{role}@structure.test", DisplayName = role.ToString() };
            Assert.True((await users.CreateAsync(user, password)).Succeeded); if (role == TenantRole.Master) master = user.Id;
            db.Add(new TenantMembership { Tenant = tenant, User = user, Role = role });
        }
        db.Add(foreign); await db.SaveChangesAsync(); return new(tenant.Id, foreign.Id, master, password);
    }
    private static async Task Login(HttpClient client, Fixture f, string role = "Master") => Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = role, password = f.Password, rememberMe = true })).StatusCode);
    private static string Items(Guid tenant) => $"/api/tenants/{tenant}/organization-items";
    private static async Task<JsonElement> GetItems(HttpClient c, Guid tenant) => await c.GetFromJsonAsync<JsonElement>(Items(tenant));
    private static object Body(string name, Guid? parent = null, Guid? version = null, bool active = true) => new { name, parentId = parent, sortOrder = 2, version = version ?? Guid.Empty, isActive = active };
    private static async Task<JsonElement> Create(HttpClient c, Guid tenant, string kind, string name, Guid? parent = null)
    {
        Assert.Equal(HttpStatusCode.Created, (await AuthTests.Post(c, Items(tenant) + "/" + kind, Body(name, parent))).StatusCode);
        return (await GetItems(c, tenant)).GetProperty(kind).EnumerateArray().Single(x => x.GetProperty("name").GetString() == name);
    }
    private static Guid Id(JsonElement x) => x.GetProperty("id").GetGuid();
    private static Guid Version(JsonElement x) => x.GetProperty("version").GetGuid();

    [Fact]
    public async Task DepartmentHierarchyDuplicateCycleStaleAndInUseRulesAreEnforcedWithAudit()
    {
        using var factory = new AuthFactory(); using var c = factory.Client(); var f = await Seed(factory); await Login(c, f);
        var root = await Create(c, f.Tenant, "departments", "물류"); var child = await Create(c, f.Tenant, "departments", "출고", Id(root));
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Items(f.Tenant) + "/departments", Body(" 물류 "))).StatusCode);
        foreach (var parent in new[] { Id(root), Id(child), Guid.NewGuid() })
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(root)}", Body("물류", parent, Version(root)))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(root)}", Body("물류", version: Version(root), active: false))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(root)}/delete", new { version = Version(root) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(child)}", Body("출고 팀", Id(root), Version(child)))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(child)}", Body("오래된 변경", Id(root), Version(child)))).StatusCode);
        var latest = (await GetItems(c, f.Tenant)).GetProperty("departments").EnumerateArray().Single(x => Id(x) == Id(child));
        Assert.Equal(HttpStatusCode.NoContent, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{Id(child)}/delete", new { version = Version(latest) })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var history = await db.OrganizationChanges.ToListAsync(); Assert.Equal(4, history.Count); Assert.All(history, x => { Assert.Equal(f.Tenant, x.TenantId); Assert.Equal(f.Master, x.ChangedByUserId); });
    }

    [Fact]
    public async Task StaffAssignmentsAreTenantScopedOptionalAndVisibleInChartAndProtectUsedItems()
    {
        using var factory = new AuthFactory(); using var c = factory.Client(); var f = await Seed(factory); await Login(c, f);
        var department = await Create(c, f.Tenant, "departments", "운영"); var position = await Create(c, f.Tenant, "positions", "매니저");
        var created = await AuthTests.Post(c, $"/api/tenants/{f.Tenant}/users", new { name = "직원", loginId = "staff", email = "staff@structure.test", role = "Employee", departmentId = Id(department), positionId = Id(position) });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode); var member = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("user");
        foreach (var (kind, item) in new[] { ("departments", department), ("positions", position) })
            Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Items(f.Tenant) + $"/{kind}/{Id(item)}/delete", new { version = Version(item) })).StatusCode);
        var chart = await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.Tenant}/organization-chart");
        var person = chart.GetProperty("employees").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "직원");
        Assert.Equal(Id(department), person.GetProperty("departmentId").GetGuid()); Assert.Equal("매니저", person.GetProperty("positionName").GetString());
        Assert.False(person.TryGetProperty("email", out _)); Assert.False(person.TryGetProperty("role", out _));
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Items(f.Tenant) + $"/positions/{Id(position)}", Body("매니저", version: Version(position), active: false))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, $"/api/tenants/{f.Tenant}/users", new { name = "신규", loginId = "otherstaff", email = "other@structure.test", role = "Employee", positionId = Id(position) })).StatusCode);
        var endpoint = $"/api/tenants/{f.Tenant}/users/{member.GetProperty("userId").GetGuid()}";
        var updated = await AuthTests.Post(c, endpoint, new { name = "직원", role = "Employee", isActive = true, version = member.GetProperty("version").GetGuid(), departmentId = (Guid?)null, positionId = Id(position) });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode); // unchanged inactive position remains valid
        var next = await updated.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, next.GetProperty("departmentId").ValueKind); Assert.Equal(member.GetProperty("billingStartsAt").GetString(), next.GetProperty("billingStartsAt").GetString());
        Guid foreignDepartment;
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var d = new Department { TenantId = f.Foreign, Name = "타사", NormalizedName = "타사" }; db.Add(d); await db.SaveChangesAsync(); foreignDepartment = d.Id; }
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, endpoint, new { name = "직원", role = "Employee", isActive = true, version = next.GetProperty("version").GetGuid(), departmentId = foreignDepartment })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(Items(f.Foreign))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, Items(f.Tenant) + $"/departments/{foreignDepartment}", Body("침범"))).StatusCode);
    }

    [Fact]
    public async Task NewPermissionsDefaultToDeniedAndExistingGrantsArePreservedAndApplyWithoutRelogin()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var admin = factory.Client(); using var employee = factory.Client(); var f = await Seed(factory);
        var old = PermissionCatalog.Defaults(); foreach (var role in old.Values) { role.Remove("org-chart"); role.Remove("organization-items"); }
        old["Administrator"]["products"] = [];
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); db.Add(new TenantPermissionSettings { TenantId = f.Tenant, RolesJson = JsonSerializer.Serialize(old), UpdatedByUserId = f.Master, Version = Guid.NewGuid(), UpdatedAt = DateTimeOffset.UtcNow }); await db.SaveChangesAsync(); }
        await Login(master, f); await Login(admin, f, "Administrator"); await Login(employee, f, "Employee");
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync(Items(f.Tenant))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"/api/tenants/{f.Tenant}/organization-chart")).StatusCode);
        var settings = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.Tenant}/permissions");
        var roles = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(settings.GetProperty("roles").GetRawText())!;
        Assert.Empty(roles["Administrator"]["products"]); Assert.Empty(roles["Administrator"]["organization-items"]);
        roles["Employee"]["org-chart"] = ["menu", "read"];
        roles["Administrator"]["organization-items"] = ["menu", "read", "create"];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, $"/api/tenants/{f.Tenant}/permissions", new { version = settings.GetProperty("version").GetGuid(), roles })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync($"/api/tenants/{f.Tenant}/organization-chart")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(Items(f.Tenant))).StatusCode);
        var item = await Create(admin, f.Tenant, "positions", "직급");
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, Items(f.Tenant) + $"/positions/{Id(item)}", Body("수정", version: Version(item)))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, Items(f.Tenant) + "/positions", Body("불가"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync(Items(f.Tenant) + "/positions", Body("CSRF 없음"))).StatusCode);
    }

    [Fact]
    public async Task MasterCanAssignOnlyOwnOrganizationWithoutChangingRoleAndCompositeForeignKeysRejectCrossTenantLinks()
    {
        using var factory = new AuthFactory(); using var c = factory.Client(); var f = await Seed(factory); await Login(c, f);
        var department = await Create(c, f.Tenant, "departments", "마스터 소속"); Guid version;
        using (var scope = factory.Services.CreateScope()) version = (await scope.ServiceProvider.GetRequiredService<WmsDbContext>().TenantMemberships.SingleAsync(x => x.UserId == f.Master)).Version;
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, $"/api/tenants/{f.Tenant}/users/{f.Master}/organization", new { version, departmentId = Id(department) })).StatusCode);
        using var verify = factory.Services.CreateScope(); var db = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        var m = await db.TenantMemberships.SingleAsync(x => x.UserId == f.Master); Assert.Equal(TenantRole.Master, m.Role); Assert.True(m.IsActive); Assert.Equal(Id(department), m.DepartmentId);
        var foreign = new Department { TenantId = f.Foreign, Name = "외부", NormalizedName = "외부" }; db.Add(foreign); await db.SaveChangesAsync();
        m.DepartmentId = foreign.Id; await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
