using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Billing;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class BillingTestClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;
    public override DateTimeOffset GetUtcNow() => Now;
}

public sealed class BillingPolicyTests
{
    private static BillingAccessService Service(BillingTestClock clock, BillingPolicyOptions? policy = null) => new(Options.Create(policy ?? new()), clock);

    [Theory]
    [InlineData("2026-10-01T00:00:00+09:00", "2026-10-31T23:59:59+09:00", "2026-11-01T00:00:00+09:00")]
    [InlineData("2026-10-31T23:59:59+09:00", "2026-10-31T23:59:59+09:00", "2026-11-01T00:00:00+09:00")]
    [InlineData("2026-12-31T12:00:00+09:00", "2026-12-31T13:00:00+09:00", "2027-01-01T00:00:00+09:00")]
    [InlineData("2028-02-29T12:00:00+09:00", "2028-02-29T13:00:00+09:00", "2028-03-01T00:00:00+09:00")]
    public void RegisteredCardAllowsOnlyRegistrationCalendarMonth(string joined, string current, string firstCharge)
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse(current)); var service = Service(clock);
        var access = service.Evaluate(DateTimeOffset.Parse(joined), TenantBillingStatus.PaymentRequired);
        Assert.Equal("RegistrationMonthFree", access.State); Assert.True(access.CanAccessWms);
        Assert.Equal(DateTimeOffset.Parse(firstCharge), access.FirstChargeAt);
        clock.Now = access.FreeUntil;
        Assert.False(service.Evaluate(DateTimeOffset.Parse(joined), TenantBillingStatus.PaymentRequired).CanAccessWms);
        Assert.Equal("PaymentRequired", service.Evaluate(DateTimeOffset.Parse(joined), TenantBillingStatus.PaymentRequired).State);
    }

    [Fact]
    public void CardRequiredAndInvalidRegistrationNeverGrantFreeAccess()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-15T00:00:00Z")); var service = Service(clock);
        Assert.False(service.Evaluate(clock.Now, TenantBillingStatus.CardRequired).CanAccessWms);
        Assert.False(service.Evaluate(clock.Now.AddMinutes(1), TenantBillingStatus.PaymentRequired).CanAccessWms);
        Assert.False(service.Evaluate(default, TenantBillingStatus.PaymentRequired).CanAccessWms);
        var tenant = new Tenant { CreatedAt = clock.Now, BillingStatus = TenantBillingStatus.PaymentRequired, ServiceStatus = TenantServiceStatus.Suspended };
        Assert.False(service.Evaluate(tenant).CanAccessWms);
        tenant.ServiceStatus = TenantServiceStatus.Active; tenant.IsActive = false;
        Assert.False(service.Evaluate(tenant).CanAccessWms);
    }

    [Fact]
    public void ConfigurablePolicyControlsFreeMonthPriceDayAndMasterEligibility()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-10T00:00:00Z"));
        var policy = new BillingPolicyOptions { MonthlyPerUserKrw = 2300, BillingDayOfMonth = 5 };
        var service = Service(clock, policy);
        Assert.Equal(DateTimeOffset.Parse("2026-11-05T00:00:00+09:00"), service.Evaluate(clock.Now, TenantBillingStatus.PaymentRequired).FirstChargeAt);
        Assert.True(service.IsBillableRole(TenantRole.Master)); Assert.Equal(2300, service.Policy.MonthlyPerUserKrw);
        policy.RegistrationMonthFree = false;
        Assert.False(service.Evaluate(clock.Now, TenantBillingStatus.PaymentRequired).CanAccessWms);
        policy.BillMasterAccounts = false;
        Assert.False(service.IsBillableRole(TenantRole.Master)); Assert.True(service.IsBillableRole(TenantRole.Employee));
    }

    [Theory]
    [InlineData(TenantRole.Master)]
    [InlineData(TenantRole.Administrator)]
    [InlineData(TenantRole.Employee)]
    public void AddedMembersIncludingMasterStartNextMonth(TenantRole role)
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-31T23:59:00+09:00")); var service = Service(clock);
        Assert.True(service.IsBillableRole(role));
        Assert.Equal(DateTimeOffset.Parse("2026-11-01T00:00:00+09:00"), service.FirstMemberChargeAt(new TenantMembership { CreatedAt = clock.Now, Role = role }));
    }

    [Fact]
    public async Task ProductionRechecksFreePeriodOnExistingCookieWithoutMutatingBillingState()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-31T23:58:00+09:00"));
        using var factory = new AuthFactory(production: true, clock: clock); using var client = factory.Client();
        var password = "Aa9!" + Guid.NewGuid().ToString("N"); Guid id;
        // Trusted card state exists only in this isolated test fixture. No external API or development DB is used.
        using (var scope = factory.Services.CreateScope())
        {
            var manager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = "free@example.test", Email = "free@example.test", DisplayName = "무료 이용" };
            Assert.True((await manager.CreateAsync(user, password)).Succeeded);
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var tenant = new Tenant { Name = "무료 기업", Code = "FREE", BillingStatus = TenantBillingStatus.PaymentRequired };
            db.Add(new TenantMembership { User = user, Tenant = tenant, Role = TenantRole.Master }); await db.SaveChangesAsync(); id = tenant.Id;
        }
        await AuthTests.Post(client, "/api/auth/login", new { email = "free@example.test", password });
        await AuthTests.Post(client, "/api/auth/select-tenant", new { tenantId = id });
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{id}/dashboard")).StatusCode);
        var workspace = await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{id}/workspace");
        Assert.Equal("RegistrationMonthFree", workspace.GetProperty("billingAccess").GetProperty("state").GetString());
        Assert.True(workspace.GetProperty("billingPolicy").GetProperty("billMasterAccounts").GetBoolean());
        clock.Now = DateTimeOffset.Parse("2026-11-01T00:00:00+09:00");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{id}/dashboard")).StatusCode);
        using var check = factory.Services.CreateScope();
        Assert.Equal(TenantBillingStatus.PaymentRequired, (await check.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.SingleAsync()).BillingStatus);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(client, $"/api/tenants/{id}/billing/confirm", new { status = "Paid" })).StatusCode);
    }
}
