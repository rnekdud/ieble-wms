using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Billing;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class SubscriptionTests
{
    [Theory]
    [InlineData("2026-10-10T13:20:00+09:00", "2026-11-10T13:20:00+09:00", "2026-12-10T13:20:00+09:00")]
    [InlineData("2026-10-29T00:00:00+09:00", "2026-11-29T00:00:00+09:00", "2026-12-29T00:00:00+09:00")]
    [InlineData("2027-01-31T23:59:59+09:00", "2027-02-28T23:59:59+09:00", "2027-03-31T23:59:59+09:00")]
    [InlineData("2028-01-31T12:00:00+09:00", "2028-02-29T12:00:00+09:00", "2028-03-31T12:00:00+09:00")]
    [InlineData("2027-12-31T12:00:00+09:00", "2028-01-31T12:00:00+09:00", "2028-02-29T12:00:00+09:00")]
    public void AnniversaryTrialBoundariesAndRecurringAnchorSurviveShortMonths(string signup, string first, string next)
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse(signup));
        var service = new BillingAccessService(Options.Create(new BillingPolicyOptions()), clock);
        var t = new Tenant { CreatedAt = clock.Now }; service.InitializeNewContract(t);
        Assert.Equal(DateTimeOffset.Parse(first), t.TrialEndsAt); Assert.Equal(t.TrialEndsAt, t.FirstChargeAt);
        Assert.True(service.Evaluate(t).CanAccessWms); Assert.False(service.Evaluate(t).HasRegisteredCard);
        Assert.Equal(DateTimeOffset.Parse(next), service.NextCycle(t, t.FirstChargeAt!.Value));
        clock.Now = t.TrialEndsAt!.Value.AddTicks(-1); Assert.True(service.Evaluate(t).CanAccessWms);
        clock.Now = t.TrialEndsAt.Value; Assert.False(service.Evaluate(t).CanAccessWms);
        t.BillingStatus = TenantBillingStatus.Paid; Assert.False(service.Evaluate(t).CanAccessWms); // Paid flag alone is insufficient for v2.
        t.PaidThrough = DateTimeOffset.Parse(next); Assert.True(service.Evaluate(t).CanAccessWms);
        clock.Now = t.PaidThrough.Value; Assert.False(service.Evaluate(t).CanAccessWms);
        t.BillingPolicyVersion = 1; Assert.False(service.Evaluate(t).CanAccessWms); // Verified legacy end dates also expire.
    }
    [Fact]
    public void MembersAreFreeForTheirCalendarMonthAndBeginOnNextEligibleTenantCycle()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-29T11:00:00+09:00"));
        var policy = new BillingPolicyOptions(); var service = new BillingAccessService(Options.Create(policy), clock);
        var t = new Tenant { CreatedAt = clock.Now }; service.InitializeNewContract(t);
        Assert.Equal(t.FirstChargeAt, service.FirstMemberChargeAt(t, new() { CreatedAt = clock.Now, Role = TenantRole.Master }));
        Assert.Equal(DateTimeOffset.Parse("2026-12-29T11:00:00+09:00"), service.FirstMemberChargeAt(t, new() { CreatedAt = DateTimeOffset.Parse("2026-11-01T00:00:00+09:00") }));
        var legacy = new Tenant { BillingPolicyVersion = 1, BillingAnchorDay = 1, FirstChargeAt = DateTimeOffset.Parse("2026-11-01T00:00:00+09:00"), BillingTimeZone = "Asia/Seoul" };
        policy.BillingDayOfMonth = 5;
        Assert.Equal(legacy.FirstChargeAt, service.FirstMemberChargeAt(legacy, new() { CreatedAt = clock.Now }));
        policy.TrialMonths = 3; policy.RecurringAnchorDay = 5;
        Assert.Equal(DateTimeOffset.Parse("2026-11-29T11:00:00+09:00"), t.FirstChargeAt); // existing contract snapshot unaffected.
    }
    private sealed record Fixture(Guid Tenant, Guid Foreign, Guid Master, string Password);
    private static async Task<Fixture> Seed(AuthFactory f)
    {
        using var initialize = f.Client();
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var billing = scope.ServiceProvider.GetRequiredService<BillingAccessService>(); var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(); var password = "safe1!" + Guid.NewGuid().ToString("N");
        var t = new Tenant { Name = "구독 기업", Code = "SUB", CreatedAt = clock.GetUtcNow() }; billing.InitializeNewContract(t);
        var other = new Tenant { Name = "다른 기업", Code = "OTHER" }; db.Add(other); Guid master = default;
        foreach (var role in new[] { "Master", "Administrator", "Employee", "Platform" }) {
            var u = new ApplicationUser { UserName = role, Email = role + "@subscription.test", DisplayName = role, SystemRole = role == "Platform" ? SystemRole.IebleAdministrator : SystemRole.None };
            Assert.True((await users.CreateAsync(u, password)).Succeeded);
            if (role == "Master") master = u.Id;
            if (role != "Platform") db.Add(new TenantMembership { Tenant = t, User = u, Role = Enum.Parse<TenantRole>(role), BillingStartsAt = t.FirstChargeAt });
        }
        await db.SaveChangesAsync(); return new(t.Id, other.Id, master, password);
    }
    private static async Task Login(HttpClient c, Fixture t, string role = "Master") => Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/login", new { email = role, password = t.Password, rememberMe = true })).StatusCode);
    private static string Url(Fixture f) => $"/api/tenants/{f.Tenant}/subscription";
    [Fact]
    public async Task ReminderFourteenDaysDismissalNextSeoulDayFeedbackIdempotencyAndAdminReview()
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-29T12:00:00+09:00")); using var f = new AuthFactory(clock: clock);
        var t = await Seed(f); using var c = f.Client(); await Login(c, t);
        Assert.False((await c.GetFromJsonAsync<JsonElement>(Url(t))).GetProperty("reminderVisible").GetBoolean());
        clock.Now = DateTimeOffset.Parse("2026-11-14T23:59:59+09:00"); await Login(c,t);
        Assert.False((await c.GetFromJsonAsync<JsonElement>(Url(t))).GetProperty("reminderVisible").GetBoolean());
        clock.Now = clock.Now.AddSeconds(1);
        var reminder = await c.GetFromJsonAsync<JsonElement>(Url(t)); Assert.True(reminder.GetProperty("reminderVisible").GetBoolean()); Assert.Equal(14, reminder.GetProperty("daysUntilFirstCharge").GetInt32()); Assert.Equal(3000, reminder.GetProperty("estimatedMonthlyKrw").GetInt64());
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Url(t) + "/dismiss", new { })).StatusCode);
        Assert.False((await c.GetFromJsonAsync<JsonElement>(Url(t))).GetProperty("reminderVisible").GetBoolean());
        clock.Now = clock.Now.AddDays(1); await Login(c,t);
        Assert.True((await c.GetFromJsonAsync<JsonElement>(Url(t))).GetProperty("reminderVisible").GetBoolean());
        var requestId = Guid.NewGuid(); var feedback = new { requestId, message = "실제 이용 소감" };
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Url(t) + "/feedback", feedback)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Url(t) + "/feedback", feedback)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Url(t) + "/feedback", new { requestId, message = "다른 내용" })).StatusCode);
        await AuthTests.Post(c, Url(t) + "/feedback", new { requestId = Guid.NewGuid(), message = "   " });
        using var admin = f.Client(); await Login(admin, t, "Platform");
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/admin/billing-feedback"); Assert.Equal(1, list.GetProperty("total").GetInt32());
        Assert.Equal("실제 이용 소감", list.GetProperty("items")[0].GetProperty("message").GetString());
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var row = await db.Tenants.FindAsync(t.Tenant);
        row!.BillingStatus = TenantBillingStatus.PaymentRequired; await db.SaveChangesAsync();
        Assert.False((await c.GetFromJsonAsync<JsonElement>(Url(t))).GetProperty("reminderVisible").GetBoolean());
    }
    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task CancelKeepsRemainingTrialOrPaidPeriodThenBlocksExistingCookieAndBilling(bool paid)
    {
        var clock = new BillingTestClock(DateTimeOffset.Parse("2026-10-29T12:00:00+09:00")); using var f = new AuthFactory(clock: clock, production: true);
        var t = await Seed(f); using var c = f.Client(); await Login(c, t);
        var end = DateTimeOffset.Parse(paid ? "2026-12-29T12:00:00+09:00" : "2026-11-29T12:00:00+09:00");
        if (paid) { using var s=f.Services.CreateScope(); var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var row=await db.Tenants.FindAsync(t.Tenant); row!.BillingStatus=TenantBillingStatus.Paid;row.PaidThrough=end;await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Url(t) + "/cancel", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, Url(t) + "/cancel", new { })).StatusCode);
        var view = await c.GetFromJsonAsync<JsonElement>(Url(t)); Assert.Equal(end, view.GetProperty("serviceEndsAt").GetDateTimeOffset());
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync($"/api/tenants/{t.Tenant}/dashboard")).StatusCode);
        clock.Now=end.AddMinutes(-1); await Login(c,t); Assert.Equal(HttpStatusCode.OK,(await c.GetAsync($"/api/tenants/{t.Tenant}/dashboard")).StatusCode);
        clock.Now=end; Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Tenant}/dashboard")).StatusCode);
        using var scope=f.Services.CreateScope();var db2=scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(1,await db2.BillingChanges.CountAsync(x=>x.Action=="AutoBillingCanceled"));
        await Assert.ThrowsAsync<OrganizationException>(()=>scope.ServiceProvider.GetRequiredService<SubscriptionService>().PrepareNextInvoice(t.Tenant,default));
        Assert.Empty(await db2.BillingInvoices.ToListAsync());
    }
    [Fact]
    public async Task MasterOnlyTenantIsolationAndCsrfProtectBillingAndFeedback()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var c=f.Client();await Login(c,t);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Foreign}/subscription")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,$"/api/tenants/{t.Foreign}/subscription/cancel",new {})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync("/api/admin/billing-feedback")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await c.PostAsJsonAsync(Url(t)+"/cancel",new {})).StatusCode);
        foreach(var role in new[]{"Administrator","Employee"}) {
            using var user=f.Client();await Login(user,t,role);
            Assert.Equal(HttpStatusCode.Forbidden,(await user.GetAsync(Url(t))).StatusCode);
            foreach(var action in new[]{"cancel","dismiss","feedback"}) Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(user,Url(t)+"/"+action,new {})).StatusCode);
        }
    }
    [Fact]
    public async Task InvoiceIntentIsIdempotentFrozenAndNeverGrantsUnverifiedPayment()
    {
        var clock=new BillingTestClock(DateTimeOffset.Parse("2026-10-29T12:00:00+09:00"));using var f=new AuthFactory(clock:clock);var t=await Seed(f);
        clock.Now=DateTimeOffset.Parse("2026-11-29T12:00:00+09:00");
        using var scope=f.Services.CreateScope();var svc=scope.ServiceProvider.GetRequiredService<SubscriptionService>();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var first=await svc.PrepareNextInvoice(t.Tenant,default);var second=await svc.PrepareNextInvoice(t.Tenant,default);
        Assert.Equal(first.Id,second.Id);Assert.Equal(3000,first.AmountKrw);Assert.Equal("ProviderNotConfigured",first.State);Assert.Null(first.ProviderPaymentId);
        Assert.Equal(1,await db.BillingInvoices.CountAsync());Assert.Equal(1,await db.BillingChanges.CountAsync(x=>x.Action=="InvoicePrepared"));
        Assert.False(scope.ServiceProvider.GetRequiredService<BillingAccessService>().Evaluate((await db.Tenants.FindAsync(t.Tenant))!).CanAccessWms);
        first.AmountKrw=1;await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
    [Fact]
    public async Task LegacyPaidCancellationRequiresVerifiedPeriodAndDoesNotInventEndDate()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();
        var row=await db.Tenants.FindAsync(t.Tenant);row!.BillingPolicyVersion=1;row.BillingStatus=TenantBillingStatus.Paid;await db.SaveChangesAsync();
        using var c=f.Client();await Login(c,t);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Url(t)+"/cancel",new {})).StatusCode);
        await db.Entry(row).ReloadAsync();Assert.Null(row.AutoBillingCanceledAt);Assert.Null(row.ServiceEndsAt);
    }
}
