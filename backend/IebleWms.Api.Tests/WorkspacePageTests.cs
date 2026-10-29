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

public sealed class WorkspacePageTests
{
    private static readonly string[] BusinessPages = ["dashboard", "warehouses", "products", "receipts", "shipments", "stock-adjustments", "stocktake", "partners", "stock-overview", "movement-stats", "stock-history"];
    [Theory]
    [InlineData(TenantRole.Master, true)]
    [InlineData(TenantRole.Administrator, true)]
    [InlineData(TenantRole.Employee, false)]
    public async Task PagesEnforceCurrentTenantRoleBillingAndDoNotFabricateData(TenantRole role, bool manager)
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var password = "lower1!" + Guid.NewGuid().ToString("N"); Guid tenantId, foreignId;
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { Email = "workspace@example.test", UserName = "workspace@example.test", DisplayName = "기업 사용자" };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            var tenant = new Tenant { Name = "기업 레이아웃", Code = "LAYOUT", BillingStatus = TenantBillingStatus.PaymentRequired };
            var foreign = new Tenant { Name = "다른 기업", Code = "OTHER", BillingStatus = TenantBillingStatus.PaymentRequired };
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new TenantMembership { User = user, Tenant = tenant, Role = role }); db.Add(foreign); await db.SaveChangesAsync(); tenantId = tenant.Id; foreignId = foreign.Id;
        }
        await AuthTests.Post(client, "/api/auth/login", new { email = "workspace@example.test", password });
        foreach (var page in BusinessPages)
        {
            var response = await client.GetAsync($"/api/tenants/{tenantId}/pages/{page}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var data = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.False(data.GetProperty("hasData").GetBoolean()); Assert.False(data.TryGetProperty("count", out _));
        }
        foreach (var page in new[] { "company", "users" })
            Assert.Equal(manager ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenantId}/pages/{page}")).StatusCode);
        foreach (var page in new[] { "billing", "permissions" })
            Assert.Equal(role == TenantRole.Master ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenantId}/pages/{page}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{tenantId}/pages/support")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{foreignId}/pages/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/tenants/{tenantId}/pages/unknown")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Tenants.SingleAsync(x => x.Id == tenantId)).BillingStatus = TenantBillingStatus.CardRequired; await db.SaveChangesAsync();
        }
        foreach (var page in BusinessPages)
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{tenantId}/pages/{page}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{tenantId}/workspace")).StatusCode);
        await AuthTests.Post(client, "/api/auth/logout", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/tenants/{tenantId}/pages/dashboard")).StatusCode);
    }
}
