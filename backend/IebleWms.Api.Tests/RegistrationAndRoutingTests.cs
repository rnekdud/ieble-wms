using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class RegistrationAndRoutingTests
{
    private static string Password() => "lower1!" + Guid.NewGuid().ToString("N");
    private static object Request(string email, string name, string number, string password) => new { email, companyName = name, businessRegistrationNumber = number, contactName = "담당자", contactPhone = "010-1234-5678", password };

    [Theory]
    [InlineData("기업 A", "1234567890", false)]
    [InlineData("다른 이름", "123-45-67890", false)]
    [InlineData("다른 이름", " 123 - 45 - 67890 ", true)]
    public async Task NormalizedDuplicateCompanyIsPrivateAndBlockedEvenIfInactive(string name, string number, bool inactive)
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        Assert.Equal(HttpStatusCode.Created, (await AuthTests.Post(client, "/api/auth/register", Request("first@example.test", "기업 A", "1234567890", Password()))).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.Tenants.SingleAsync()).IsActive = !inactive; await db.SaveChangesAsync();
        }
        var response = await AuthTests.Post(client, "/api/auth/register", Request("new@example.test", name, number, Password()));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(CompanyRegistrationService.DuplicateCompanyMessage, body.GetProperty("message").GetString());
        Assert.Equal("duplicate_company", body.GetProperty("code").GetString());
        Assert.DoesNotContain("first@example.test", body.ToString()); Assert.False(body.TryGetProperty("tenantId", out _));
        using var check = factory.Services.CreateScope(); Assert.Equal(1, await check.ServiceProvider.GetRequiredService<WmsDbContext>().Users.CountAsync());
    }

    [Fact]
    public async Task SameNameWithDifferentBusinessNumberIsAllowedAndTrimmed()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        await AuthTests.Post(client, "/api/auth/register", Request("first@example.test", "같은 기업명", "1234567890", Password()));
        Assert.Equal(HttpStatusCode.Created, (await AuthTests.Post(client, "/api/auth/register", Request("second@example.test", "  같은 기업명  ", " 987 - 65 - 43210 ", Password()))).StatusCode);
        using var scope = factory.Services.CreateScope(); var tenants = await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.ToListAsync();
        Assert.Equal(2, tenants.Count); Assert.All(tenants, tenant => Assert.Equal("같은 기업명", tenant.Name));
        Assert.Contains(tenants, tenant => tenant.BusinessRegistrationNumber == "9876543210");
    }

    [Theory]
    [InlineData(TenantRole.Master)]
    [InlineData(TenantRole.Administrator)]
    [InlineData(TenantRole.Employee)]
    public async Task SingleMembershipAutomaticallyBindsSessionAndSupportsLowercasePassword(TenantRole role)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        await AuthTests.Post(client, "/api/auth/register", Request("single@example.test", "아이블소프트", "1234567890", password)); Guid tenantId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var membership = await db.TenantMemberships.SingleAsync(); tenantId = membership.TenantId;
            membership.Role = role; membership.IsDefault = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = "single@example.test", password })).StatusCode);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(tenantId.ToString(), me.GetProperty("selectedTenantId").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{tenantId}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenantId}/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/overview")).StatusCode);
    }

    [Fact]
    public async Task MultiMembershipWithoutDefaultNeverChoosesFirstAndDefaultPersistsOnRelogin()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        await AuthTests.Post(client, "/api/auth/register", Request("multi@example.test", "첫 기업", "1234567890", password)); Guid first, second, foreign;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var firstMembership = await db.TenantMemberships.SingleAsync(); firstMembership.IsDefault = false; first = firstMembership.TenantId;
            var b = new Tenant { Code = "SECOND", Name = "기본 기업" }; var c = new Tenant { Code = "FOREIGN", Name = "다른 기업" };
            db.Add(new TenantMembership { UserId = firstMembership.UserId, Tenant = b }); db.Add(c); await db.SaveChangesAsync(); second = b.Id; foreign = c.Id;
        }
        await AuthTests.Post(client, "/api/auth/login", new { email = "multi@example.test", password });
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me"); Assert.Equal("default_required", me.GetProperty("tenantResolution").GetString());
        Assert.Equal(JsonValueKind.Null, me.GetProperty("selectedTenantId").ValueKind);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{first}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(client, "/api/auth/default-tenant", new { tenantId = foreign })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/default-tenant", new { tenantId = second })).StatusCode);
        await AuthTests.Post(client, "/api/auth/logout", new { }); await AuthTests.Post(client, "/api/auth/login", new { email = "multi@example.test", password });
        Assert.Equal(second.ToString(), (await client.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("selectedTenantId").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{first}/workspace")).StatusCode);
    }

    [Fact]
    public async Task PasswordResetUsesSameLowercasePolicy()
    {
        using var factory = new AuthFactory(resetTokens: true); using var client = factory.Client(); var initial = Password();
        await AuthTests.Post(client, "/api/auth/register", Request("reset@example.test", "재설정 기업", "1234567890", initial));
        using var scope = factory.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByEmailAsync("reset@example.test"))!;
        var token = await users.GeneratePasswordResetTokenAsync(user);
        Assert.False((await users.ResetPasswordAsync(user, token, "lowercaseonly!")).Succeeded);
        Assert.True((await users.ResetPasswordAsync(user, token, "lowercase123!")).Succeeded);
        Assert.True(await users.CheckPasswordAsync(user, "lowercase123!"));
    }

    [Fact]
    public async Task DatabaseRejectsTwoDefaultMembershipsForOneUser()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        await AuthTests.Post(client, "/api/auth/register", Request("default@example.test", "기본 기업", "1234567890", Password()));
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var user = await db.Users.SingleAsync();
        db.Add(new TenantMembership { UserId = user.Id, IsDefault = true, Tenant = new Tenant { Code = "DUPLICATEDEFAULT", Name = "두 번째" } });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData("lowercase123!", true)]
    [InlineData("Uppercase123!", true)]
    [InlineData("lowercaseonly!", false)]
    [InlineData("lowercase12345", false)]
    [InlineData("UPPERCASE123!", false)]
    [InlineData("short12!", true)]
    [InlineData("short1!", false)]
    public async Task SharedIdentityPolicyAppliesToPasswordChanges(string candidate, bool valid)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var initial = Password();
        await AuthTests.Post(client, "/api/auth/register", Request("password@example.test", "비밀번호 기업", "1234567890", initial));
        using var scope = factory.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByEmailAsync("password@example.test"))!;
        Assert.False(users.Options.Password.RequireUppercase);
        Assert.Equal(valid, (await users.ChangePasswordAsync(user, initial, candidate)).Succeeded);
    }
}
