using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class OnboardingWorkflowTests
{
    [Fact]
    public async Task NewCompanyCanConfigureStaffAndReceiveStockWithoutPaidStatusOrDevelopmentGrant()
    {
        using var factory = new AuthFactory();
        using var master = factory.Client();
        using var staff = factory.CreateClient();
        await OnboardingWorkflowScenario.Run(master, staff);
    }

}

public static class OnboardingWorkflowScenario
{
    // Also executed against an isolated PostgreSQL database by the integration QA runner.
    public static async Task Run(HttpClient master, HttpClient staff)
    {
        static async Task<JsonElement> Get(HttpClient c, string path)
        {
            var response = await c.GetAsync(path);
            Assert.True(response.StatusCode == HttpStatusCode.OK, path + ": " + await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        static async Task<JsonElement> Post(HttpClient c, string path, object body, HttpStatusCode code = HttpStatusCode.OK)
        {
            var response = await AuthTests.Post(c, path, body);
            Assert.True(response.StatusCode == code, path + ": " + await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        static Guid Id(JsonElement x) => x.GetProperty("id").GetGuid();
        static Guid Version(JsonElement x) => x.GetProperty("version").GetGuid();
        var suffix = Guid.NewGuid().ToString("N");
        var email = suffix + "@workflow.test";
        var password = "New1!" + suffix;
        await Post(master, "/api/auth/register", new { companyName = "신규 운영 검증 기업", businessRegistrationNumber = "5948132760", contactName = "마스터", contactPhone = "010-1234-5678", email, password }, HttpStatusCode.Created);
        await Post(master, "/api/auth/login", new { email, password });
        var me = await Get(master, "/api/auth/me");
        var tenant = me.GetProperty("selectedTenantId").GetGuid();
        var root = $"/api/tenants/{tenant}";
        var workspace = await Get(master, root + "/workspace");
        Assert.True(workspace.GetProperty("billingAccess").GetProperty("canAccessWms").GetBoolean());
        Assert.False(workspace.GetProperty("billingAccess").GetProperty("hasRegisteredCard").GetBoolean());
        Assert.NotEqual("Paid", workspace.GetProperty("billingStatus").GetString());
        await Get(master, root + "/dashboard");
        var company = (await Get(master, root + "/company")).GetProperty("company");
        await Post(master, root + "/company", new { version = Version(company), name = "운영 검증 기업", contactName = "담당자", address = "서울" });
        foreach (var kind in new[] { "departments", "positions" })
            await Post(master, root + "/organization-items/" + kind, new { name = kind == "departments" ? "물류팀" : "담당", isActive = true, sortOrder = 1 }, HttpStatusCode.Created);
        var items = await Get(master, root + "/organization-items");
        var loginId = "staff" + suffix[..10];
        var created = await Post(master, root + "/users", new { name = "운영 직원", loginId, email = loginId + "@workflow.test", role = "Employee", departmentId = Id(items.GetProperty("departments")[0]), positionId = Id(items.GetProperty("positions")[0]) }, HttpStatusCode.Created);
        var staffId = created.GetProperty("user").GetProperty("userId").GetGuid();
        await Post(staff, "/api/auth/login", new { email = loginId, password = loginId });
        Assert.True((await Get(staff, "/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(root + "/products")).StatusCode);
        await Post(staff, "/api/auth/change-password", new { currentPassword = loginId, newPassword = password, confirmPassword = password });
        Assert.False((await Get(staff, "/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(root + "/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync($"/api/tenants/{Guid.NewGuid()}/products")).StatusCode);
        var settings = await Get(master, root + "/permissions");
        var grants = settings.GetProperty("roles").Deserialize<Dictionary<string, Dictionary<string, string[]>>>()!;
        grants["Employee"]["org-chart"] = ["menu", "read"];
        grants["Employee"]["products"] = ["menu", "read", "create"];
        await Post(master, root + "/permissions", new { version = Version(settings), roles = grants });
        await Get(staff, root + "/organization-chart");
        var product = await Post(staff, root + "/products", new { requestId = Guid.NewGuid(), code = "FLOW-1", name = "입고 상품", unit = "EA", safetyStock = 2 }, HttpStatusCode.Created);
        // Revocation must take effect for an already signed-in employee.
        settings = await Get(master, root + "/permissions"); grants["Employee"]["products"] = ["menu", "read"];
        await Post(master, root + "/permissions", new { version = Version(settings), roles = grants });
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(staff, root + "/products", new { requestId = Guid.NewGuid(), code = "DENIED", name = "차단", unit = "EA" })).StatusCode);
        var warehouse = await Post(master, root + "/warehouses", new { name = "운영 창고" }, HttpStatusCode.Created);
        var wid = Id(warehouse);
        var location = await Post(master, root + $"/warehouses/{wid}/locations", new { name = "바닥 위치", code = "F-01", isActive = true }, HttpStatusCode.Created);
        var partner = (await Post(master, root + "/partners", new { requestId = Guid.NewGuid(), code = "PART-1", name = "거래처", type = "BOTH" }, HttpStatusCode.Created)).GetProperty("partner");
        var receipt = await Post(master, root + "/receipts", new { requestId = Guid.NewGuid(), expectedDate = DateOnly.FromDateTime(DateTime.UtcNow), partnerId = Id(partner), warehouseId = wid, contactName = "입고 담당", lines = new[] { new { productId = Id(product), expectedQuantity = 10 } } }, HttpStatusCode.Created);
        var receiptRoot = root + "/receipts/" + Id(receipt.GetProperty("receipt"));
        receipt = await Post(master, receiptRoot + "/start-inspection", new { version = Version(receipt.GetProperty("receipt")) });
        var line = Id(receipt.GetProperty("lines")[0]);
        receipt = await Post(master, receiptRoot + "/inspection", new { version = Version(receipt.GetProperty("receipt")), lines = new[] { new { lineId = line, quantity = 10 } } });
        receipt = await Post(master, receiptRoot + "/placements", new { version = Version(receipt.GetProperty("receipt")), lines = new[] { new { lineId = line, placements = new[] { new { locationId = Id(location), quantity = 10 } } } } });
        Assert.Equal(0, (await Get(master, root + "/inventory")).GetProperty("total").GetInt32());
        var version = Version(receipt.GetProperty("receipt"));
        await Post(master, receiptRoot + "/confirm", new { version });
        await Post(master, receiptRoot + "/confirm", new { version });
        var stock = await Get(master, root + "/inventory");
        Assert.Equal(1, stock.GetProperty("total").GetInt32());
        Assert.Equal(10, stock.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        await Get(master, root + "/dashboard");
        // The complete workflow must not change billing or the single-master invariant.
        var after = await Get(master, root + "/workspace");
        Assert.Equal(workspace.GetProperty("billingStatus").GetString(), after.GetProperty("billingStatus").GetString());
        Assert.Equal(workspace.GetProperty("billingAccess").GetProperty("freeUntil").GetString(), after.GetProperty("billingAccess").GetProperty("freeUntil").GetString());
        var members = (await Get(master, root + "/users")).GetProperty("items");
        Assert.Single(members.EnumerateArray(), x => x.GetProperty("role").GetString() == "Master");
        Assert.Contains(members.EnumerateArray(), x => x.GetProperty("userId").GetGuid() == staffId);
    }
}
