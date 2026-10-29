using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Net.Http.Headers;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class PasswordChangeTests
{
    private const string Endpoint = "/api/auth/change-password";
    private sealed record Account(Guid Id, Guid? TenantId, string Password, Guid OtherId, string OtherHash);
    private static async Task<Account> Seed(AuthFactory factory, string role = "Employee")
    {
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var password = "original1!" + Guid.NewGuid().ToString("N");
        var user = new ApplicationUser { UserName = "personal", Email = "personal@example.test", DisplayName = "본인", SystemRole = role == "Platform" ? SystemRole.IebleAdministrator : SystemRole.None };
        Assert.True((await users.CreateAsync(user, password)).Succeeded);
        Guid? tenantId = null;
        if (role != "Platform")
        {
            var tenant = new Tenant { Code = "PERSONAL", Name = "비밀번호 테스트 기업", BillingStatus = TenantBillingStatus.Paid };
            db.Add(new TenantMembership { Tenant = tenant, User = user, Role = Enum.Parse<TenantRole>(role) });
            await db.SaveChangesAsync(); tenantId = tenant.Id;
        }
        var other = new ApplicationUser { UserName = "other", Email = "other@example.test", DisplayName = "다른 사용자" };
        Assert.True((await users.CreateAsync(other, password)).Succeeded);
        return new(user.Id, tenantId, password, other.Id, other.PasswordHash!);
    }
    private static Task<HttpResponseMessage> Login(HttpClient client, string password, bool persistent = false) =>
        AuthTests.Post(client, "/api/auth/login", new { email = "personal", password, rememberMe = persistent });
    private static object Change(string current, string next = "newpwd1!", string? confirm = null) =>
        new { currentPassword = current, newPassword = next, confirmPassword = confirm ?? next };
    private static SetCookieHeaderValue SessionCookie(HttpResponseMessage response) =>
        SetCookieHeaderValue.Parse(response.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.session=")));

    [Theory]
    [InlineData("Platform", false)] [InlineData("Platform", true)]
    [InlineData("Master", false)] [InlineData("Master", true)]
    [InlineData("Administrator", false)] [InlineData("Administrator", true)]
    [InlineData("Employee", false)] [InlineData("Employee", true)]
    public async Task AllRolesCanChangeOwnPasswordAndRevokeOtherSessionsWhilePreservingCurrentExpiry(string role, bool persistent)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); using var otherSession = factory.Client();
        var account = await Seed(factory, role);
        var login = await Login(client, account.Password, persistent); Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(otherSession, account.Password, true)).StatusCode);
        var before = SessionCookie(login);
        var result = await AuthTests.Post(client, Endpoint, Change(account.Password)); Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        var after = SessionCookie(result); Assert.Equal(before.Expires, after.Expires); Assert.NotEqual(before.Value, after.Value);
        Assert.Equal(persistent, after.Expires.HasValue); Assert.True(after.HttpOnly); Assert.Equal("strict", after.SameSite.ToString().ToLowerInvariant());
        Assert.Equal(HttpStatusCode.Unauthorized, (await otherSession.GetAsync("/api/auth/me")).StatusCode);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(account.Id, me.GetProperty("user").GetProperty("id").GetGuid());
        Assert.False(me.GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        var business = role == "Platform" ? "/api/admin/overview" : $"/api/tenants/{account.TenantId}/dashboard";
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(business)).StatusCode);
        using var fresh = factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(fresh, account.Password)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(fresh, "newpwd1!")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(account.OtherHash, (await db.Users.FindAsync(account.OtherId))!.PasswordHash);
        var audit = await db.OrganizationChanges.SingleAsync(x => x.Action == "PasswordChanged");
        Assert.Equal(account.Id, audit.ChangedByUserId); Assert.Equal(account.Id, audit.TargetUserId); Assert.Equal(account.TenantId, audit.TenantId);
        Assert.DoesNotContain(account.Password, audit.BeforeJson + audit.AfterJson); Assert.DoesNotContain("newpwd1!", audit.BeforeJson + audit.AfterJson);
        Assert.DoesNotContain((await db.Users.FindAsync(account.Id))!.PasswordHash!, audit.BeforeJson + audit.AfterJson);
    }

    [Theory]
    [InlineData("short1!", false)]
    [InlineData("short12!", true)]
    [InlineData("SHORT12!", false)]
    [InlineData("short123", false)]
    [InlineData("short!!!", false)]
    public async Task RegistrationEnforcesEightCharacterMinimumAndExistingComplexity(string password, bool allowed)
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var response = await AuthTests.Post(client, "/api/auth/register", new {
            companyName = "길이 검증 기업", businessRegistrationNumber = "1234567890", contactName = "담당자",
            contactPhone = "010-1234-5678", email = "length@example.test", password
        });
        Assert.Equal(allowed ? HttpStatusCode.Created : HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(allowed ? 1 : 0, await db.Users.CountAsync());
        Assert.Equal(allowed ? 1 : 0, await db.Tenants.CountAsync());
        if (allowed)
        {
            Assert.False((await db.Users.SingleAsync()).MustChangePassword);
            Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = "length@example.test", password })).StatusCode);
        }
    }

    [Fact]
    public async Task RegisteredMasterKeepsSignupPasswordAndReceivesAccurateLockoutFeedback()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var original = "signup12!";
        Assert.Equal(HttpStatusCode.Created, (await AuthTests.Post(client, "/api/auth/register", new {
            companyName = "마스터 검증", businessRegistrationNumber = "1234567890", contactName = "마스터",
            contactPhone = "010-1234-5678", email = "master@example.test", password = original
        })).StatusCode);
        var loggedIn = await AuthTests.Post(client, "/api/auth/login", new { email = "master@example.test", password = original, rememberMe = true });
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        var id = me.GetProperty("user").GetProperty("id").GetGuid();
        Assert.False(me.GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var user = (await db.Users.FindAsync(id))!;
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.True(await users.CheckPasswordAsync(user, original));
            Assert.False(await users.CheckPasswordAsync(user, user.UserName!));
            Assert.Equal(TenantRole.Master, (await db.TenantMemberships.SingleAsync(x => x.UserId == id)).Role);
        }
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, Endpoint, Change("incorrect"))).StatusCode);
        // A valid existing cookie can outlive a password-attempt lockout.
        // Correct credentials must be reported as locked, not as an incorrect password.
        var locked = await AuthTests.Post(client, Endpoint, Change(original));
        Assert.Equal(HttpStatusCode.BadRequest, locked.StatusCode);
        var error = await locked.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("password_change_locked", error.GetProperty("code").GetString());
        Assert.Contains("잠겨", error.GetProperty("message").GetString());
        Assert.NotNull(locked.Headers.RetryAfter);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var user = (await db.Users.FindAsync(id))!;
            Assert.True(await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().CheckPasswordAsync(user, original));
            Assert.False(user.MustChangePassword); Assert.Empty(await db.OrganizationChanges.ToListAsync());
            user.LockoutEnd = DateTimeOffset.UtcNow.AddMinutes(-1); // Only expire the isolated test account's lock.
            await db.SaveChangesAsync();
        }
        var changed = await AuthTests.Post(client, Endpoint, Change(original));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(SessionCookie(loggedIn).Expires, SessionCookie(changed).Expires);
        Assert.Equal(id, (await client.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("id").GetGuid());
        using var fresh = factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(fresh, "/api/auth/login", new { email = "master@example.test", password = original })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(fresh, "/api/auth/login", new { email = "master@example.test", password = "newpwd1!" })).StatusCode);
    }

    [Fact]
    public async Task IncorrectCurrentMismatchReuseWeakPasswordAndOverpostedUserCannotChangeAnyPassword()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var account = await Seed(factory);
        await Login(client, account.Password);
        foreach (var body in new[] { Change("incorrect"), Change(account.Password, confirm: "mismatch123!"), Change(account.Password, account.Password), Change(account.Password, "short1!"), Change(account.Password, "weakpassword"), Change(account.Password, "personal") })
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, Endpoint, body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, Endpoint, new { currentPassword = account.Password, newPassword = "newpwd1!", confirmPassword = "newpwd1!", userId = account.OtherId })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True(await users.CheckPasswordAsync((await users.FindByIdAsync(account.Id.ToString()))!, account.Password));
        Assert.Equal(account.OtherHash, (await db.Users.FindAsync(account.OtherId))!.PasswordHash); Assert.Empty(await db.OrganizationChanges.ToListAsync());
    }

    [Fact]
    public async Task AuthenticationCsrfAndRateLimitProtectPersonalPasswordEndpoint()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var account = await Seed(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(client, Endpoint, Change(account.Password))).StatusCode);
        await Login(client, account.Password);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(Endpoint, Change(account.Password))).StatusCode);
        using var invalid = new HttpRequestMessage(HttpMethod.Post, Endpoint) { Content = JsonContent.Create(Change(account.Password)) };
        invalid.Headers.Add("X-CSRF-TOKEN", "invalid"); Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(invalid)).StatusCode);
        // Validation-only failures exercise the real limiter without triggering account lockout.
        HttpResponseMessage response = null!;
        for (var i = 0; i < 11; i++) response = await AuthTests.Post(client, Endpoint, Change(account.Password, confirm: "mismatch123!"));
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode); Assert.NotNull(response.Headers.RetryAfter);
        using var scope = factory.Services.CreateScope(); Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().OrganizationChanges.ToListAsync());
    }

    [Fact]
    public async Task RepeatedIncorrectCurrentPasswordLocksAccountAndCannotChangeWithCorrectPasswordAfterLockout()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var account = await Seed(factory); await Login(client, account.Password);
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, Endpoint, Change("incorrect"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, Endpoint, Change(account.Password))).StatusCode);
        using var fresh = factory.Client(); Assert.Equal(HttpStatusCode.Unauthorized, (await Login(fresh, account.Password)).StatusCode);
        using var scope = factory.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByIdAsync(account.Id.ToString()))!; Assert.True(await users.IsLockedOutAsync(user)); Assert.True(await users.CheckPasswordAsync(user, account.Password));
    }
}
