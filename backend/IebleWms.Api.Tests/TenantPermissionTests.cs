using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using IebleWms.Api.Auth;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class TenantPermissionTests
{
    private sealed record Settings(Guid Version, Dictionary<string, Dictionary<string, string[]>> Roles);
    private sealed record Fixture(Guid TenantId, Guid ForeignId, Guid MasterId, Guid AdministratorId, Guid EmployeeId, string Password);
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "PERMISSIONS", Name = "권한 기업", BillingStatus = TenantBillingStatus.Paid };
        var foreign = new Tenant { Code = "FOREIGN", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid };
        var password = "test1!" + Guid.NewGuid().ToString("N");
        var ids = new List<Guid>();
        foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee })
        {
            var user = new ApplicationUser { Email = $"{role}@example.test", UserName = $"{role}@example.test", DisplayName = role.ToString() };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            db.Add(new TenantMembership { User = user, Tenant = tenant, Role = role }); ids.Add(user.Id);
        }
        db.Add(foreign); await db.SaveChangesAsync();
        return new(tenant.Id, foreign.Id, ids[0], ids[1], ids[2], password);
    }
    private static async Task Login(HttpClient client, Fixture fixture, string role) =>
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = $"{role}@example.test", password = fixture.Password, rememberMe = true })).StatusCode);
    private static async Task<Settings> Read(HttpClient client, Guid tenant) => (await client.GetFromJsonAsync<Settings>($"/api/tenants/{tenant}/permissions"))!;
    private static Task<HttpResponseMessage> Save(HttpClient client, Guid tenant, Settings settings) => AuthTests.Post(client, $"/api/tenants/{tenant}/permissions", settings);
    private static async Task<bool> Allowed(AuthFactory factory, Guid userId, Guid tenantId, string feature, string action, Guid? selectedTenant = null)
    {
        using var scope = factory.Services.CreateScope();
        var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(AuthConfiguration.TenantClaim, (selectedTenant ?? tenantId).ToString()) }, "test"));
        var http = new DefaultHttpContext { User = principal };
        http.Request.RouteValues["tenantId"] = tenantId;
        var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var previous = accessor.HttpContext; accessor.HttpContext = http;
        try { return (await scope.ServiceProvider.GetRequiredService<IAuthorizationService>().AuthorizeAsync(principal, http, $"Permission:{feature}:{action}")).Succeeded; }
        finally { accessor.HttpContext = previous; }
    }

    [Theory]
    [InlineData("Master", HttpStatusCode.OK)]
    [InlineData("Administrator", HttpStatusCode.Forbidden)]
    [InlineData("Employee", HttpStatusCode.Forbidden)]
    public async Task OnlyCurrentCompanyMasterCanReadOrWriteSettingsAndBilling(string role, HttpStatusCode expected)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/tenants/{f.TenantId}/permissions")).StatusCode);
        await Login(client, f, role);
        Assert.Equal(expected, (await client.GetAsync($"/api/tenants/{f.TenantId}/permissions")).StatusCode);
        foreach (var page in new[] { "billing", "permissions" })
            Assert.Equal(expected, (await client.GetAsync($"/api/tenants/{f.TenantId}/pages/{page}")).StatusCode);
        var draft = new Settings(Guid.Empty, PermissionCatalog.Defaults()); draft.Roles["Employee"]["products"] = [];
        Assert.Equal(role == "Master" ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await Save(client, f.TenantId, draft)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{f.ForeignId}/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(client, f.ForeignId, draft)).StatusCode);
        var workspace = await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/workspace");
        Assert.Equal(role == "Master", workspace.GetProperty("canManageBilling").GetBoolean());
    }

    [Fact]
    public async Task ChangesApplyToExistingSessionsAndTenantScopedApisWithImmutableAuditAndReset()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var employee = factory.Client(); using var admin = factory.Client();
        var f = await Seed(factory); await Login(master, f, "Master"); await Login(employee, f, "Employee"); await Login(admin, f, "Administrator");
        var before = await Read(master, f.TenantId);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync($"/api/tenants/{f.TenantId}/pages/products")).StatusCode);
        before.Roles["Employee"]["products"] = []; before.Roles["Administrator"]["dashboard"] = [];
        before.Roles["Employee"]["users"] = ["menu", "read"];
        Assert.Equal(HttpStatusCode.OK, (await Save(master, f.TenantId, before)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"/api/tenants/{f.TenantId}/pages/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync($"/api/tenants/{f.TenantId}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync($"/api/tenants/{f.TenantId}/pages/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await master.GetAsync($"/api/tenants/{f.TenantId}/pages/products")).StatusCode);
        var workspace = await employee.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/workspace");
        Assert.Empty(workspace.GetProperty("permissions").GetProperty("products").EnumerateArray());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var audit = await db.TenantPermissionChanges.SingleAsync();
            Assert.Equal(f.MasterId, audit.ChangedByUserId); Assert.Equal(f.TenantId, audit.TenantId);
            Assert.True(audit.ChangedAt > DateTimeOffset.UtcNow.AddMinutes(-5));
            Assert.Contains("menu", JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(audit.BeforeJson)!["Employee"]["products"]);
            Assert.Empty(JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string[]>>>(audit.AfterJson)!["Employee"]["products"]);
            Assert.Equal(PermissionCatalog.Defaults()["Employee"]["products"], (await scope.ServiceProvider.GetRequiredService<TenantPermissionService>().ReadAsync(f.ForeignId))["Employee"]["products"]);
            audit.AfterJson = "{}";
            await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        }
        var current = await Read(master, f.TenantId);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(master, f.TenantId, before)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Save(master, f.TenantId, new Settings(current.Version, PermissionCatalog.Defaults()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync($"/api/tenants/{f.TenantId}/pages/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync($"/api/tenants/{f.TenantId}/pages/users")).StatusCode);
        using var verify = factory.Services.CreateScope(); var finalDb = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(2, await finalDb.TenantPermissionChanges.CountAsync());
        var restored = await Read(master, f.TenantId);
        Assert.Equal(HttpStatusCode.OK, (await Save(master, f.TenantId, restored)).StatusCode);
        Assert.Equal(2, await finalDb.TenantPermissionChanges.CountAsync());
    }

    [Fact]
    public async Task EveryActionPolicyHonorsRoleFeatureRevocationAndBillingGate()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, f, "Master");
        foreach (var feature in PermissionCatalog.Features)
            foreach (var action in feature.Actions)
            {
                Assert.True(await Allowed(factory, f.MasterId, f.TenantId, feature.Key, action));
                Assert.True(await Allowed(factory, f.AdministratorId, f.TenantId, feature.Key, action));
                Assert.Equal(feature.Key is not ("users" or "company") && action is "menu" or "read", await Allowed(factory, f.EmployeeId, f.TenantId, feature.Key, action));
            }
        var settings = await Read(client, f.TenantId);
        foreach (var feature in PermissionCatalog.Features)
        {
            settings.Roles["Administrator"][feature.Key] = [];
            settings.Roles["Employee"][feature.Key] = feature.Actions.ToArray();
        }
        Assert.Equal(HttpStatusCode.OK, (await Save(client, f.TenantId, settings)).StatusCode);
        foreach (var feature in PermissionCatalog.Features)
            foreach (var action in feature.Actions)
            {
                Assert.False(await Allowed(factory, f.AdministratorId, f.TenantId, feature.Key, action));
                Assert.True(await Allowed(factory, f.EmployeeId, f.TenantId, feature.Key, action));
                Assert.True(await Allowed(factory, f.MasterId, f.TenantId, feature.Key, action));
            }
        Assert.False(await Allowed(factory, f.MasterId, f.ForeignId, "products", "read"));
        Assert.False(await Allowed(factory, f.MasterId, f.TenantId, "products", "read", f.ForeignId));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.FindAsync(f.TenantId))!.BillingStatus = TenantBillingStatus.CardRequired; await db.SaveChangesAsync();
        }
        Assert.False(await Allowed(factory, f.MasterId, f.TenantId, "receipts", "confirm"));
        Assert.True(await Allowed(factory, f.MasterId, f.TenantId, "users", "read"));
    }

    [Theory]
    [InlineData("master")]
    [InlineData("unknownFeature")]
    [InlineData("unknownAction")]
    [InlineData("missingRole")]
    [InlineData("missingFeature")]
    [InlineData("missingRead")]
    [InlineData("missingUserManagement")]
    [InlineData("duplicateAction")]
    [InlineData("nullFeature")]
    public async Task InvalidOrPrivilegeEscalatingPayloadIsRejected(string kind)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, f, "Master");
        var settings = await Read(client, f.TenantId);
        switch (kind)
        {
            case "master": settings.Roles["Master"] = []; break;
            case "unknownFeature": settings.Roles["Employee"]["permissions"] = ["menu", "read"]; break;
            case "unknownAction": settings.Roles["Employee"]["products"] = ["menu", "read", "superuser"]; break;
            case "missingRole": settings.Roles.Remove("Administrator"); break;
            case "missingFeature": settings.Roles["Employee"].Remove("products"); break;
            case "missingRead": settings.Roles["Employee"]["products"] = ["menu", "create"]; break;
            case "missingUserManagement": settings.Roles["Employee"]["users"] = ["menu", "read", "delete"]; break;
            case "duplicateAction": settings.Roles["Employee"]["products"] = ["menu", "read", "read"]; break;
            case "nullFeature": settings.Roles["Employee"]["products"] = null!; break;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(client, f.TenantId, settings)).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.TenantPermissionSettings.ToListAsync()); Assert.Empty(await db.TenantPermissionChanges.ToListAsync());
    }

    [Fact]
    public async Task PlatformAdministratorHasNoImplicitMasterAuthority()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.True((await users.CreateAsync(new ApplicationUser { Email = "Platform@example.test", UserName = "Platform@example.test", DisplayName = "운영자", SystemRole = SystemRole.IebleAdministrator }, f.Password)).Succeeded);
        }
        await Login(client, f, "Platform");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{f.TenantId}/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(client, f.TenantId, new Settings(Guid.Empty, PermissionCatalog.Defaults()))).StatusCode);
    }

    [Fact]
    public async Task FailedAuditWriteRollsBackSettingsAndConcurrentUpdateRollsBackItsAudit()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, f, "Master");
        var settings = await Read(client, f.TenantId); settings.Roles["Employee"]["products"] = [];
        Assert.Equal(HttpStatusCode.OK, (await Save(client, f.TenantId, settings)).StatusCode);
        using var first = factory.Services.CreateScope(); using var second = factory.Services.CreateScope();
        var db1 = first.ServiceProvider.GetRequiredService<WmsDbContext>(); var db2 = second.ServiceProvider.GetRequiredService<WmsDbContext>();
        var row1 = await db1.TenantPermissionSettings.SingleAsync(); var row2 = await db2.TenantPermissionSettings.SingleAsync();
        var original = row1.Version;
        var badAudit = new TenantPermissionChange { TenantId = f.TenantId, ChangedByUserId = Guid.NewGuid(), ChangedAt = DateTimeOffset.UtcNow,
            BeforeJson = row1.RolesJson, AfterJson = row1.RolesJson, Version = Guid.NewGuid() };
        row1.Version = badAudit.Version; db1.Add(badAudit);
        await Assert.ThrowsAsync<DbUpdateException>(() => db1.SaveChangesAsync());
        db1.ChangeTracker.Clear();
        row1 = await db1.TenantPermissionSettings.SingleAsync();
        Assert.Equal(original, row1.Version); Assert.Equal(1, await db1.TenantPermissionChanges.CountAsync());
        row1.Version = Guid.NewGuid(); row1.RolesJson = JsonSerializer.Serialize(PermissionCatalog.Defaults());
        db1.Add(new TenantPermissionChange { TenantId = f.TenantId, ChangedByUserId = f.MasterId, ChangedAt = DateTimeOffset.UtcNow,
            BeforeJson = row2.RolesJson, AfterJson = row1.RolesJson, Version = row1.Version });
        await db1.SaveChangesAsync();
        row2.Version = Guid.NewGuid();
        db2.Add(new TenantPermissionChange { TenantId = f.TenantId, ChangedByUserId = f.MasterId, ChangedAt = DateTimeOffset.UtcNow,
            BeforeJson = row2.RolesJson, AfterJson = row2.RolesJson, Version = row2.Version });
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());
        db2.ChangeTracker.Clear();
        Assert.Equal(row1.Version, (await db2.TenantPermissionSettings.SingleAsync()).Version);
        Assert.Equal(2, await db2.TenantPermissionChanges.CountAsync());
    }

    [Fact]
    public async Task SettingsWritesRequireCsrfAndDemotedMasterLosesAccessWithoutLogin()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, f, "Master");
        var settings = await Read(client, f.TenantId);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/tenants/{f.TenantId}/permissions", settings)).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.TenantMemberships.FindAsync(f.TenantId, f.MasterId))!.Role = TenantRole.Administrator; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{f.TenantId}/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Save(client, f.TenantId, settings)).StatusCode);
    }
}
