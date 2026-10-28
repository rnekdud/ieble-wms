using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class PersistentLoginTests
{
    private static string Password() => "lower1!" + Guid.NewGuid().ToString("N");
    private static async Task<Guid> Seed(AuthFactory factory, string password, bool platform = false)
    {
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { Email = "persistent@example.test", UserName = "persistent@example.test", DisplayName = "자동 로그인", SystemRole = platform ? SystemRole.IebleAdministrator : SystemRole.None };
        Assert.True((await users.CreateAsync(user, password)).Succeeded);
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var tenant = new Tenant { Code = "PERSISTENT", Name = "자동 로그인 기업", BillingStatus = TenantBillingStatus.PaymentRequired };
        db.Add(new TenantMembership { Tenant = tenant, User = user, Role = TenantRole.Master }); await db.SaveChangesAsync();
        return tenant.Id;
    }
    private static Task<HttpResponseMessage> Login(HttpClient client, string password, bool rememberMe) => AuthTests.Post(client, "/api/auth/login", new { email = "persistent@example.test", password, rememberMe });
    private static CookieOptionsResult ReadCookie(HttpResponseMessage response)
    {
        var raw = response.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("__Host-ieble.session="));
        var cookie = Microsoft.Net.Http.Headers.SetCookieHeaderValue.Parse(raw);
        return new(raw.Split(';')[0], cookie.Expires);
    }
    private sealed record CookieOptionsResult(string Header, DateTimeOffset? Expires);
    private static HttpClient Replay(AuthFactory factory, string cookie)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", cookie); return client;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PersistenceControlsCookieExpiryAndPreservesItWhenTenantClaimsRefresh(bool remember)
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-10T00:00:00Z"));
        using var factory = new AuthFactory(production: true, clock: clock); using var client = factory.Client(); var password = Password();
        await Seed(factory, password);
        var response = await Login(client, password, remember); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = ReadCookie(response);
        if (remember) Assert.Equal(clock.Now.AddDays(30), cookie.Expires); else Assert.Null(cookie.Expires);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var membership = await db.TenantMemberships.SingleAsync(); membership.IsActive = false; await db.SaveChangesAsync();
        }
        clock.Now = clock.Now.AddHours(1);
        var me = await client.GetAsync("/api/auth/me"); var refreshed = ReadCookie(me);
        Assert.Equal(cookie.Expires, refreshed.Expires);
        clock.Now = clock.Now.Add(remember ? TimeSpan.FromDays(30) : TimeSpan.FromHours(8));
        using var replay = Replay(factory, refreshed.Header);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task PersistentCookieRevalidatesFreeMonthSuspensionMembershipAndAccount()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-31T23:00:00+09:00"));
        using var factory = new AuthFactory(production: true, clock: clock); using var client = factory.Client(); var password = Password();
        var tenant = await Seed(factory, password); await Login(client, password, true);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        clock.Now = DateTimeOffset.Parse("2026-11-01T00:00:00+09:00");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenant}/dashboard")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var row = await db.Tenants.SingleAsync(); row.BillingStatus = TenantBillingStatus.Paid; row.ServiceStatus = TenantServiceStatus.Suspended; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenant}/pages/warehouses")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.TenantMemberships.SingleAsync()).IsActive = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenant}/workspace")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.Users.SingleAsync()).IsActive = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task LogoutInvalidatesPersistentCookieIncludingCopiedTicketAndFailureIssuesNoCookie()
    {
        using var factory = new AuthFactory(production: true); using var client = factory.Client(); var password = Password(); await Seed(factory, password);
        var failed = await Login(client, Password(), true);
        Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        Assert.False(failed.Headers.TryGetValues("Set-Cookie", out var cookies) && cookies.Any(x => x.StartsWith("__Host-ieble.session=")));
        var response = await Login(client, password, true); var cookie = ReadCookie(response);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await AuthTests.Post(client, "/api/auth/logout", new { })).StatusCode);
        using var replay = Replay(factory, cookie.Header);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task PersistentAdministratorLosesAdminAuthorityWhenRoleIsRevoked()
    {
        using var factory = new AuthFactory(production: true); using var client = factory.Client(); var password = Password(); await Seed(factory, password, true);
        await Login(client, password, true); Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/overview")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.Users.SingleAsync()).SystemRole = SystemRole.None; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/overview")).StatusCode);
    }

    [Fact]
    public async Task ConfigurableDurationIsServerControlled()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-10T00:00:00Z"));
        using var factory = new AuthFactory(production: true, clock: clock); using var client = factory.Client(); var password = Password(); await Seed(factory, password);
        var options = factory.Services.GetRequiredService<IOptions<IebleWms.Api.Auth.LoginSessionOptions>>().Value;
        options.PersistentDays = 12;
        var response = await AuthTests.Post(client, "/api/auth/login", new { email = "persistent@example.test", password, rememberMe = true, expiresUtc = clock.Now.AddYears(10) });
        Assert.Equal(clock.Now.AddDays(12), ReadCookie(response).Expires);
    }
}
