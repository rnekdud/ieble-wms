using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class DashboardWarehouseSelectionTests
{
    [Fact]
    public async Task SearchByNameAndBothCodesIsPagedActiveAndTenantScoped()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        await Run(factory, client, false);
    }

    [ScanPostgresFact]
    public async Task PostgresDashboardSelectionRiskAndPermissionRegression()
    {
        using var factory = new ScanPostgresFactory(); using var client = factory.Client();
        await Run(factory, client, true);
    }

    static async Task Run(WebApplicationFactory<Program> factory, HttpClient client, bool postgres)
    {
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var password = "Qa1!" + Guid.NewGuid().ToString("N");
        var username = "dashboard-" + suffix;
        var tenant = new Tenant { Code = "DASH-" + suffix.ToUpperInvariant(), Name = "대시보드 격리 QA", BillingStatus = TenantBillingStatus.Paid };
        var other = new Tenant { Code = "OTHER-" + suffix.ToUpperInvariant(), Name = "다른 기업 QA", BillingStatus = TenantBillingStatus.Paid };
        Guid foreignId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = username, Email = username + "@qa.test", DisplayName = "대시보드 QA" };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            var otherUser = new ApplicationUser { UserName = "other-" + username, Email = "other-" + username + "@qa.test", DisplayName = "다른 기업 QA" };
            Assert.True((await users.CreateAsync(otherUser, password)).Succeeded);
            db.AddRange(new TenantMembership { Tenant = tenant, User = user, Role = TenantRole.Master }, new TenantMembership { Tenant = other, User = otherUser, Role = TenantRole.Master });
            var foreign = new Warehouse { TenantId = other.Id, Code = "WH-0001", Name = "격리 창고", CustomCode = "PRIVATE-SEOUL" };
            foreignId = foreign.Id; db.Add(foreign);
            for (var i = 1; i <= 35; i++) db.Warehouses.Add(new Warehouse { TenantId = tenant.Id, Code = $"WH-{i:0000}", Name = i == 1 ? "인천 물류센터" : $"보관창고 {i:00}", CustomCode = i == 1 ? "ICN-INTERNAL" : $"INTERNAL-{i:00}" });
            db.Warehouses.Add(new Warehouse { TenantId = tenant.Id, Code = "OFF", Name = "인천 비활성", CustomCode = "ICN-OFF", IsActive = false });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = username, password })).StatusCode);
        var root = $"/api/tenants/{tenant.Id}";
        async Task<JsonElement> Read(string path)
        {
            var response = await client.GetAsync(path);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        var list = root + "/warehouses?status=active";
        foreach (var term in new[] { "인천", "wh-0001", "icn-internal" })
        {
            var result = await Read(list + "&search=" + Uri.EscapeDataString(term));
            Assert.Equal(1, result.GetProperty("total").GetInt32());
            Assert.Equal("인천 물류센터", result.GetProperty("items")[0].GetProperty("warehouse").GetProperty("name").GetString());
        }
        var first = await Read(list); var second = await Read(list + "&page=2");
        Assert.Equal(35, first.GetProperty("total").GetInt32()); Assert.Equal(20, first.GetProperty("pageSize").GetInt32());
        Assert.Equal(20, first.GetProperty("items").GetArrayLength()); Assert.Equal(15, second.GetProperty("items").GetArrayLength());
        Assert.Equal(0, (await Read(list + "&search=PRIVATE-SEOUL")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{other.Id}/warehouses?status=active")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(root + "/dashboard/warehouses/" + foreignId)).StatusCode);
        var compact = await Read(root + "/dashboard/warehouses?compact=true");
        Assert.Equal(35, compact.GetProperty("warehouses").GetArrayLength());
        // Verify the exact existing reservation, expiry and document-count policies on PostgreSQL too.
        if (postgres)
        {
            await WarehouseRiskScenario.Run(client, root, factory.Services);
            await WarehouseDashboardScenario.Run(client, root, factory.Services);
            var warehouses = (await Read(root + "/dashboard/warehouses?compact=true")).GetProperty("warehouses");
            var riskWarehouse = warehouses.EnumerateArray().Single(w => w.GetProperty("name").GetString()!.StartsWith("Risk "));
            var id = riskWarehouse.GetProperty("id").GetGuid();
            var racks = (await Read(root + "/dashboard/warehouses/" + id)).GetProperty("racks").EnumerateArray().ToArray();
            var plan = new { version = Guid.Empty, schemaVersion = 1, aspectRatio = 1.7, objects = racks.Select((rack, i) => new { id = Guid.NewGuid(), type = "rack", label = rack.GetProperty("code").GetString(), x = .18 + (i % 3) * .31, y = .2 + (i / 3) * .27, width = .20, height = .15, rotation = 0, fill = "#a7ccdf", shape = "rectangle", rackId = rack.GetProperty("id").GetGuid() }).ToArray() };
            Assert.True((await AuthTests.Post(client, root + "/warehouses/" + id + "/plan", plan)).IsSuccessStatusCode);
            var fixturePath = Environment.GetEnvironmentVariable("WMS_DASHBOARD_QA_FIXTURE");
            if (!string.IsNullOrEmpty(fixturePath)) await File.WriteAllTextAsync(fixturePath, JsonSerializer.Serialize(new { tenant = tenant.Id, username, password, warehouse = id }));
        }
    }
}
