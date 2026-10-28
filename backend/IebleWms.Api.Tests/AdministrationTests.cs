using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Administration;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class AdministrationTests
{
    private static string Secret() => "Aa9!" + Guid.NewGuid().ToString("N");
    private static async Task<Guid> SeedAdmin(AuthFactory factory, string password)
    {
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<BootstrapAdminService>();
        Assert.True((await service.CreateAsync("platform@example.test", "운영 담당자", password)).Succeeded);
        return (await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.SingleAsync()).Id;
    }
    private static async Task Login(HttpClient client, string email, string password) =>
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email, password })).StatusCode);
    private static async Task<(Guid Tenant, Guid User)> SeedTenant(AuthFactory factory, string password, string email = "master@example.test", string code = "CUSTOMER")
    {
        using var scope = factory.Services.CreateScope();
        var user = new ApplicationUser { UserName = email, Email = email, DisplayName = "기업 담당자", PhoneNumber = "010-0000-0000" };
        Assert.True((await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().CreateAsync(user, password)).Succeeded);
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var tenant = new Tenant { Code = code, Name = "등록 기업 " + code, BillingStatus = TenantBillingStatus.Paid, BusinessRegistrationNumber = code == "CUSTOMER" ? "1234567890" : null };
        db.Add(new TenantMembership { User = user, Tenant = tenant, Role = TenantRole.Master });
        await db.SaveChangesAsync(); return (tenant.Id, user.Id);
    }
    private static async Task<Guid> Version(AuthFactory factory, Guid tenant)
    {
        using var scope = factory.Services.CreateScope();
        return (await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.SingleAsync(x => x.Id == tenant)).Version;
    }
    private static async Task<HttpResponseMessage> Change(HttpClient admin, AuthFactory factory, Guid tenant, string action, string reason = "검토 완료") =>
        await AuthTests.Post(admin, $"/api/admin/tenants/{tenant}/status", new { action, reason, version = await Version(factory, tenant) });

    [Fact]
    public async Task BootstrapHashesPasswordAndIsPermanentEvenAfterAdministratorDemotion()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Secret();
        await SeedAdmin(factory, password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var user = await db.Users.SingleAsync();
            Assert.Equal(SystemRole.IebleAdministrator, user.SystemRole); Assert.NotEqual(password, user.PasswordHash);
            Assert.True(await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().CheckPasswordAsync(user, password));
            Assert.Single(await db.AdministratorBootstraps.ToListAsync()); Assert.Empty(await db.TenantMemberships.ToListAsync());
            user.SystemRole = SystemRole.None; user.IsActive = false; await db.SaveChangesAsync();
        }
        using (var scope = factory.Services.CreateScope())
        {
            Assert.False((await scope.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync("second@example.test", "두 번째", Secret())).Succeeded);
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.CountAsync());
        }
    }

    [Fact]
    public async Task BootstrapReceiptFailureRollsBackTheCreatedIdentityUser()
    {
        using var factory = new AuthFactory(failBootstrap: true); using var client = factory.Client();
        using (var scope = factory.Services.CreateScope())
            Assert.False((await scope.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync("platform@example.test", "Admin", Secret())).Succeeded);
        using var check = factory.Services.CreateScope(); var db = check.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.Users.ToListAsync()); Assert.Empty(await db.AdministratorBootstraps.ToListAsync());
    }

    [Fact]
    public async Task ConcurrentStatusWriteRollsBackHistoryAndReturnsConflict()
    {
        using var factory = new AuthFactory(staleStatusWrite: true); using var admin = factory.Client(); var password = Secret();
        await SeedAdmin(factory, password); var (tenant, _) = await SeedTenant(factory, password);
        await Login(admin, "platform@example.test", password);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(admin, factory, tenant, "suspend")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(TenantServiceStatus.Active, (await db.Tenants.SingleAsync()).ServiceStatus);
        Assert.Empty(await db.TenantStatusChanges.ToListAsync());
    }

    [Fact]
    public async Task BootstrapRejectsProductionAndDoesNotPromoteExistingCustomer()
    {
        using (var production = new AuthFactory(production: true))
        {
            using var client = production.Client(); using var scope = production.Services.CreateScope();
            Assert.False((await scope.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync("platform@example.test", "Admin", Secret())).Succeeded);
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.ToListAsync());
        }
        using var factory = new AuthFactory(); using var customer = factory.Client();
        await SeedTenant(factory, Secret());
        using var scoped = factory.Services.CreateScope();
        Assert.False((await scoped.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync("master@example.test", "Admin", Secret())).Succeeded);
        var db = scoped.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(SystemRole.None, (await db.Users.SingleAsync()).SystemRole);
        Assert.Empty(await db.AdministratorBootstraps.ToListAsync());
    }

    [Fact]
    public async Task ExistingAdministratorClosesBootstrapWithoutCreatingAnotherUser()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await users.CreateAsync(new ApplicationUser { UserName = "existing@example.test", Email = "existing@example.test", DisplayName = "기존 관리자", SystemRole = SystemRole.IebleAdministrator }, Secret());
        Assert.False((await scope.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync("new@example.test", "새 관리자", Secret())).Succeeded);
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1, await db.Users.CountAsync()); Assert.Equal(1, await db.AdministratorBootstraps.CountAsync());
    }

    [Fact]
    public async Task PaidCompanyCanBeSuspendedAndReactivatedWithAudit()
    {
        using var factory = new AuthFactory(); using var admin = factory.Client(); var password = Secret();
        var adminId = await SeedAdmin(factory, password); var (tenant, _) = await SeedTenant(factory, password);
        using var member = factory.CreateClient(); await Login(member, "master@example.test", password);
        await AuthTests.Post(member, "/api/auth/select-tenant", new { tenantId = tenant });
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        await Login(admin, "platform@example.test", password);
        Assert.Equal(HttpStatusCode.OK, (await Change(admin, factory, tenant, "suspend", "운영 정책 검토 중")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Change(admin, factory, tenant, "reactivate", "검토 완료 후 재개")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var history = await db.TenantStatusChanges.ToListAsync(); Assert.Equal(2, history.Count);
        Assert.All(history, h => { Assert.Equal(adminId, h.ChangedByUserId); Assert.False(string.IsNullOrWhiteSpace(h.Reason)); });
    }

    [Fact]
    public async Task ApprovalAndRejectionAreRemovedAndUnpaidCompanyCannotBypassBilling()
    {
        using var factory = new AuthFactory(); using var admin = factory.Client(); var password = Secret();
        await SeedAdmin(factory, password); var (tenant, _) = await SeedTenant(factory, password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.SingleAsync()).BillingStatus = TenantBillingStatus.CardRequired; await db.SaveChangesAsync();
        }
        await Login(admin, "platform@example.test", password);
        Assert.Equal(HttpStatusCode.BadRequest, (await Change(admin, factory, tenant, "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Change(admin, factory, tenant, "reject")).StatusCode);
        using var member = factory.CreateClient(); await Login(member, "master@example.test", password);
        await AuthTests.Post(member, "/api/auth/select-tenant", new { tenantId = tenant });
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/tenants/{tenant}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Change(admin, factory, tenant, "suspend")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(admin, factory, tenant, "reactivate")).StatusCode);
        using var check = factory.Services.CreateScope();
        Assert.Equal(1, await check.ServiceProvider.GetRequiredService<WmsDbContext>().TenantStatusChanges.CountAsync());
    }

    [Fact]
    public async Task ProductionBlocksCardRequiredAndPaymentRequiredAndOffersNoPaymentOverride()
    {
        var clock = new BillingTestClock(new DateTimeOffset(2026, 9, 10, 0, 0, 0, TimeSpan.Zero));
        using var factory = new AuthFactory(production: true, clock: clock); using var member = factory.Client(); var password = Secret();
        var (tenant, _) = await SeedTenant(factory, password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.SingleAsync()).BillingStatus = TenantBillingStatus.CardRequired; await db.SaveChangesAsync();
        }
        clock.Now = new DateTimeOffset(2026, 10, 10, 0, 0, 0, TimeSpan.Zero);
        await Login(member, "master@example.test", password);
        await AuthTests.Post(member, "/api/auth/select-tenant", new { tenantId = tenant });
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        var workspace = await member.GetFromJsonAsync<JsonElement>($"/api/tenants/{tenant}/workspace");
        Assert.Equal("TossPayments", workspace.GetProperty("billingProvider").GetString());
        Assert.False(workspace.GetProperty("billingProviderConfigured").GetBoolean());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.SingleAsync()).BillingStatus = TenantBillingStatus.PaymentRequired; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(member, $"/api/tenants/{tenant}/billing/confirm", new { status = "Paid" })).StatusCode);
        using var check = factory.Services.CreateScope();
        Assert.Equal(TenantBillingStatus.PaymentRequired, (await check.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.SingleAsync()).BillingStatus);
    }

    [Fact]
    public async Task CustomerCannotReadAdministrativeContactsOrMutateStatusAndCsrfIsRequired()
    {
        using var factory = new AuthFactory(); using var admin = factory.Client(); var password = Secret(); await SeedAdmin(factory, password);
        var (tenant, _) = await SeedTenant(factory, password); var (foreign, _) = await SeedTenant(factory, password, "other@example.test", "OTHER");
        using var member = factory.CreateClient(); await Login(member, "master@example.test", password); await AuthTests.Post(member, "/api/auth/select-tenant", new { tenantId = tenant });
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/admin/tenants")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/admin/tenants/{tenant}/history")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Change(member, factory, tenant, "suspend")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/tenants/{foreign}/workspace")).StatusCode);
        await Login(admin, "platform@example.test", password);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/tenants/{tenant}/status", new { action = "suspend", reason = "검토", version = await Version(factory, tenant) })).StatusCode);
    }

    [Fact]
    public async Task StaleVersionCannotOverwriteDecisionAndListSupportsStatusSearchAndHistory()
    {
        using var factory = new AuthFactory(); using var admin = factory.Client(); var password = Secret(); await SeedAdmin(factory, password);
        var (tenant, _) = await SeedTenant(factory, password); await Login(admin, "platform@example.test", password);
        var oldVersion = await Version(factory, tenant);
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/admin/tenants?status=Active&search=123-45-67890");
        Assert.Equal(1, list.GetProperty("total").GetInt32());
        Assert.Equal("기업 담당자", list.GetProperty("items")[0].GetProperty("contacts")[0].GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Change(admin, factory, tenant, "suspend")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(admin, $"/api/admin/tenants/{tenant}/status", new { action = "reactivate", reason = "오래된 화면", version = oldVersion })).StatusCode);
        Assert.Equal(0, (await admin.GetFromJsonAsync<JsonElement>("/api/admin/tenants?status=Active")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await admin.GetFromJsonAsync<JsonElement>("/api/admin/tenants?status=Suspended")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await admin.GetFromJsonAsync<JsonElement>($"/api/admin/tenants/{tenant}/history")).GetProperty("items").GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/tenants?status=Unknown")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        (await db.TenantStatusChanges.SingleAsync()).Reason = "이력 변조";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
}
