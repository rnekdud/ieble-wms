using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class ReceiptWorkflowPostgresTests
{
    [ScanPostgresFact]
    public async Task PostgresReceiptPlannedRackInspectionPlacementAndConfirmation()
    {
        using var factory = new ScanPostgresFactory();
        using var client = factory.Client();
        var suffix = Guid.NewGuid().ToString("N");
        var tenant = new Tenant { Code = "RECEIPT-" + suffix.ToUpperInvariant(), Name = "격리 입고 QA", BillingStatus = TenantBillingStatus.Paid };
        var user = new ApplicationUser { UserName = "receipt-" + suffix, Email = suffix + "@qa.test", DisplayName = "QA" };
        var password = "QA1!" + suffix;
        var partner = new Partner { TenantId = tenant.Id, Code = "SUP", NormalizedCode = "SUP", Name = "QA 매입처", Type = "BOTH", CreationRequestId = Guid.NewGuid() };
        var warehouse = new Warehouse { TenantId = tenant.Id, Code = "WH-QA", Name = "격리 창고" };
        var rack = new WarehouseRack { TenantId = tenant.Id, WarehouseId = warehouse.Id, Code = "RACK-QA", Name = "예정 랙", Levels = 1, Bays = 1 };
        var location = new StorageLocation { TenantId = tenant.Id, WarehouseId = warehouse.Id, RackId = rack.Id, Code = "QA-1", Name = "위치", Level = 1, Bay = 1 };
        var product = new Product { TenantId = tenant.Id, Code = "QA", NormalizedCode = "QA", Name = "QA 상품", Unit = "EA", RetailPrice = 5000, CreationRequestId = Guid.NewGuid() };
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            db.AddRange(tenant, new TenantMembership { Tenant = tenant, User = user, Role = TenantRole.Master }, partner, warehouse, rack, location, product,
                new StorageBarcode { TenantId = tenant.Id, ProductId = product.Id, Value = "QA" + suffix, IsPrimary = true });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = user.UserName, password })).StatusCode);
        async Task<JsonElement> Post(string url, object body, HttpStatusCode expected = HttpStatusCode.OK)
        {
            var response = await AuthTests.Post(client, url, body);
            Assert.True(response.StatusCode == expected, await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        var root = $"/api/tenants/{tenant.Id}/receipts";
        var detail = await Post(root, new ReceiptRequest { RequestId = Guid.NewGuid(), ContactName = "격리 QA", PartnerId = partner.Id, WarehouseId = warehouse.Id, ExpectedDate = new DateOnly(2026, 11, 6), Lines = [new() { ProductId = product.Id, ExpectedQuantity = 20, PlannedRackId = rack.Id }] }, HttpStatusCode.Created);
        var url = root + "/" + detail.GetProperty("receipt").GetProperty("id").GetGuid();
        Guid Version() => detail.GetProperty("receipt").GetProperty("version").GetGuid();
        var line = detail.GetProperty("lines")[0].GetProperty("id").GetGuid();
        Assert.Equal(rack.Id, detail.GetProperty("lines")[0].GetProperty("plannedRackId").GetGuid());
        Assert.Equal(5000, detail.GetProperty("lines")[0].GetProperty("retailPrice").GetDecimal());
        foreach (var term in new[] { "예정 랙", "RACK-QA", "QA-1" })
        {
            var choices = await client.GetFromJsonAsync<JsonElement>($"{root}/choices?kind=locations&warehouseId={warehouse.Id}&search={Uri.EscapeDataString(term)}");
            Assert.Equal(location.Id, choices.GetProperty("items")[0].GetProperty("id").GetGuid());
        }
        detail = await Post(url + "/start-inspection", new { version = Version() });
        for (var i = 0; i < 10; i++)
        {
            await Post(url + "/scan-inspection", new { requestId = Guid.NewGuid(), barcode = "QA" + suffix });
        }
        detail = await client.GetFromJsonAsync<JsonElement>(url);
        await Post(url + "/inspection-quantity", new { requestId = Guid.NewGuid(), version = Version(), lineId = line, quantity = 15, reason = "직접 입력 QA" });
        await Post(url + "/scan-inspection", new { requestId = Guid.NewGuid(), barcode = "QA" + suffix });
        detail = await client.GetFromJsonAsync<JsonElement>(url);
        Assert.Equal(16, detail.GetProperty("lines")[0].GetProperty("inspectedQuantity").GetDecimal());
        detail = await Post(url + "/inspection", new { version = Version(), lines = new[] { new { lineId = line, quantity = 16 } } });
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(client, url + "/scan-inspection", new { requestId = Guid.NewGuid(), barcode = "QA" + suffix })).StatusCode);
        foreach (var (quantity, message) in new[] { (21, "초과"), (11, "부족") })
        {
            var error = await Post(url + "/placements", new { version = Version(), lines = new[] { new { lineId = line, placements = new[] { new { locationId = location.Id, quantity } } } } }, HttpStatusCode.BadRequest);
            Assert.Contains(message, error.GetProperty("message").GetString());
        }
        using (var scope = factory.Services.CreateScope())
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.Where(x => x.TenantId == tenant.Id).ToListAsync());
        detail = await Post(url + "/placements", new { version = Version(), lines = new[] { new { lineId = line, placements = new[] { new { locationId = location.Id, quantity = 16 } } } } });
        await Post(url + "/confirm", new { version = Version() });
        using var verify = factory.Services.CreateScope();
        var context = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(16, (await context.StockBalances.SingleAsync(x => x.TenantId == tenant.Id)).Quantity);
        Assert.Single(await context.StockMovements.Where(x => x.TenantId == tenant.Id).ToListAsync());
    }
}
