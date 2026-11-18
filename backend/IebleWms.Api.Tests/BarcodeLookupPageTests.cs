using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class BarcodeLookupPageTests
{
    [Fact] public async Task BarcodePageReusesGrantsAndReadOnlyDetailWithTenantIsolation()
    {
        using var f = new AuthFactory(); using var c = f.Client(); await Run(f, c);
    }
    [ScanPostgresFact] public async Task PostgresBarcodeLookupPage()
    {
        using var f = new ScanPostgresFactory(); using var c = f.Client(); await Run(f, c, Environment.GetEnvironmentVariable("WMS_BARCODE_PAGE_QA_FIXTURE"));
    }
    static async Task Run(WebApplicationFactory<Program> f, HttpClient c, string? output = null)
    {
        var password = "Qa1!" + Guid.NewGuid().ToString("N");
        var tenant = new Tenant { Code = "LOOKUP", Name = "바코드 조회 QA 기업", BillingStatus = TenantBillingStatus.Paid };
        var other = new Tenant { Code = "OTHER", Name = "격리 QA 기업", BillingStatus = TenantBillingStatus.Paid };
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            foreach (var name in new[] { "Master", "Reader", "Other" })
            {
                var user = new ApplicationUser { UserName = name, Email = name + "@lookup.qa", DisplayName = name };
                Assert.True((await users.CreateAsync(user, password)).Succeeded);
                db.Add(new TenantMembership { Tenant = name == "Other" ? other : tenant, User = user, Role = name == "Reader" ? TenantRole.Employee : TenantRole.Master });
            }
            await db.SaveChangesAsync();
        }
        var root = $"/api/tenants/{tenant.Id}";
        async Task Login(string name) => Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/login", new { email = name, password })).StatusCode);
        async Task<JsonElement> Post(string url, object body)
        {
            var r = await AuthTests.Post(c, url, body); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync());
            return await r.Content.ReadFromJsonAsync<JsonElement>();
        }
        static Guid Id(JsonElement v) => v.GetProperty("id").GetGuid();
        await Login("Master");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(root + "/pages/barcode-lookup")).StatusCode);
        var cat1 = await Post(root + "/products/categories", new { name = "식품" });
        var cat2 = await Post(root + "/products/categories", new { name = "가공식품", parentId = Id(cat1) });
        var cat3 = await Post(root + "/products/categories", new { name = "스낵", parentId = Id(cat2) });
        var type = await Post(root + "/products/types", new { name = "기업 완제품" });
        const string png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
        var product = await Post(root + "/products", new {
            requestId = Guid.NewGuid(), code = "QA-SNACK-01", name = "바코드 검증 스낵 세트", unit = "EA", modelNumber = "SNACK-2026", origin = "대한민국",
            categoryId = Id(cat3), productTypeId = Id(type), costPrice = 1234.56m, retailPrice = 2500, weightGrams = 300, widthCm = 12, depthCm = 8, heightCm = 5,
            boxWeightGrams = 3600, boxWidthCm = 40, boxDepthCm = 30, boxHeightCm = 25, notes = "별도 QA 데이터 · 개발 기업 데이터와 무관",
            barcodes = new[] { new { change = new { mode = "manual", value = "QA-PRODUCT-PRIMARY" }, isPrimary = true }, new { change = new { mode = "manual", value = "QA-PRODUCT-ALIAS" }, isPrimary = false } },
            images = new[] { new { fileName = "qa-front.png", base64 = png, isPrimary = true }, new { fileName = "qa-back.png", base64 = png, isPrimary = false } }
        });
        await LegacyUnitFixture.Set(f.Services, Id(product), "BOX");
        var empty = await Post(root + "/products", new { requestId = Guid.NewGuid(), code = "QA-NO-IMAGE", name = "이미지 없는 QA 상품", unit = "EA", barcode = new { mode = "manual", value = "QA-NO-IMAGE" } });
        var warehouse = await Post(root + "/warehouses", new { name = "조회 QA 창고" });
        var wr = root + "/warehouses/" + Id(warehouse);
        var rack = await Post(wr + "/racks", new { code = "R-01", name = "식품 보관 랙", levels = 3, bays = 4, barcode = new { mode = "manual", value = "QA-RACK" } });
        var front = await c.GetFromJsonAsync<JsonElement>(wr + "/racks/" + Id(rack) + "/front");
        var loc = front.GetProperty("locations")[0].GetProperty("location");
        loc = await Post(wr + "/locations/" + Id(loc), new { version = loc.GetProperty("version").GetGuid(), code = loc.GetProperty("code").GetString(), name = "1단 1칸", barcode = new { mode = "manual", value = "QA-LOCATION" } });
        var packed = await Post(root + "/products", new { requestId = Guid.NewGuid(), name = "포장 재고 QA", innerPackQuantity = 10, outerPackQuantity = 5, palletPackQuantity = 20,
            barcodes = new[] { new { change = new { mode = "manual", value = "QA-PACKED" }, packageCode = "PALLET", isPrimary = true } } });
        var warehouse2 = await Post(root + "/warehouses", new { name = "조회 QA 두 번째 창고" });
        var rack2 = await Post(root + "/warehouses/" + Id(warehouse2) + "/racks", new { code = "R-02", name = "두 번째 랙", levels = 1, bays = 1 });
        var front2 = await c.GetFromJsonAsync<JsonElement>(root + "/warehouses/" + Id(warehouse2) + "/racks/" + Id(rack2) + "/front");
        var loc2 = front2.GetProperty("locations")[0].GetProperty("location");
        async Task<string> Snapshot()
        {
            using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            return JsonSerializer.Serialize(new {
                products = await db.Products.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                labels = await db.StorageBarcodes.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                locations = await db.StorageLocations.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                stock = await db.StockBalances.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                changes = await db.ProductChanges.CountAsync(), movements = await db.StockMovements.CountAsync()
            });
        }
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.StockBalances.Add(new() { TenantId = tenant.Id, WarehouseId = Id(warehouse), LocationId = Id(loc), ProductId = Id(product), SourceKey = "QA-LOOKUP-STOCK", Unit = "BOX", Quantity = 100, ReservedQuantity = 20, LotNumber = "QA-LOT" });
            db.StockBalances.AddRange(
                new() { TenantId = tenant.Id, WarehouseId = Id(warehouse), LocationId = Id(loc), ProductId = Id(packed), SourceKey = "EA-LOT-A", Unit = "EA", Quantity = 300, ReservedQuantity = 30, LotNumber = "A" },
                new() { TenantId = tenant.Id, WarehouseId = Id(warehouse), LocationId = Id(loc), ProductId = Id(packed), SourceKey = "EA-LOT-B", Unit = "EA", Quantity = 400, ReservedQuantity = 50, LotNumber = "B" },
                new() { TenantId = tenant.Id, WarehouseId = Id(warehouse2), LocationId = Id(loc2), ProductId = Id(packed), SourceKey = "EA-LOT-C", Unit = "EA", Quantity = 500, ReservedQuantity = 20, LotNumber = "C" },
                new() { TenantId = tenant.Id, WarehouseId = Id(warehouse2), LocationId = Id(loc2), ProductId = Id(product), SourceKey = "LEGACY-BOX", Unit = "BOX", Quantity = 1100, ReservedQuantity = 0 });
            await db.SaveChangesAsync();
        }
        var before = await Snapshot();
        var aggregateUrl = root + "/reports/stock-overview?view=product&productId=";
        async Task AssertTotals(Guid productId, string unit, decimal quantity, decimal reserved, decimal available)
        {
            var totals = await c.GetFromJsonAsync<JsonElement>(aggregateUrl + productId);
            var rows = totals.GetProperty("items"); Assert.Equal(1, rows.GetArrayLength());
            Assert.Equal(unit, rows[0].GetProperty("unit").GetString());
            Assert.Equal(quantity, rows[0].GetProperty("quantity").GetDecimal());
            Assert.Equal(reserved, rows[0].GetProperty("reservedQuantity").GetDecimal());
            Assert.Equal(available, rows[0].GetProperty("availableQuantity").GetDecimal());
        }
        await AssertTotals(Id(packed), "EA", 1200, 100, 1100);
        await AssertTotals(Id(product), "BOX", 1200, 20, 1180);
        await AssertTotals(Id(empty), "EA", 0, 0, 0);
        foreach (var value in new[] { "QA-PRODUCT-PRIMARY", "QA-PRODUCT-ALIAS" })
        {
            var result = await c.GetFromJsonAsync<JsonElement>(root + "/barcodes/lookup?value=" + value);
            Assert.Equal(Id(product), Id(result.GetProperty("item")));
            Assert.Equal(JsonValueKind.Null, result.GetProperty("item").GetProperty("costPrice").ValueKind);
        }
        var detailUrl = root + "/products/" + Id(product);
        var detail = await c.GetFromJsonAsync<JsonElement>(detailUrl);
        Assert.Equal(1234.56m, detail.GetProperty("product").GetProperty("costPrice").GetDecimal());
        Assert.Equal(2, detail.GetProperty("product").GetProperty("barcodes").GetArrayLength());
        Assert.Equal(2, detail.GetProperty("product").GetProperty("images").GetArrayLength());
        foreach (var kind in new[] { "RACK", "LOCATION" }) Assert.Equal(kind.ToLowerInvariant(), (await c.GetFromJsonAsync<JsonElement>(root + "/barcodes/lookup?value=QA-" + kind)).GetProperty("kind").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync(root + "/barcodes/lookup?value=UNREGISTERED")).StatusCode);
        var stock = await c.GetFromJsonAsync<JsonElement>(root + "/barcodes/locations/" + Id(loc) + "/stock");
        Assert.Equal(3, stock.GetProperty("total").GetInt32());
        Assert.Equal(80, stock.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("unit").GetString() == "BOX").GetProperty("availableQuantity").GetDecimal());
        await Login("Reader");
        async Task Grants(bool products, bool warehouses)
        {
            using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var roles = PermissionCatalog.Defaults(); roles["Employee"]["products"] = products ? ["menu", "read"] : []; roles["Employee"]["warehouses"] = warehouses ? ["menu", "read"] : [];
            roles["Employee"]["stock-overview"] = [];
            var row = await db.TenantPermissionSettings.SingleOrDefaultAsync(x => x.TenantId == tenant.Id);
            if (row == null) { row = new() { TenantId = tenant.Id, UpdatedByUserId = (await db.TenantMemberships.SingleAsync(x => x.TenantId == tenant.Id && x.Role == TenantRole.Master)).UserId }; db.Add(row); }
            row.RolesJson = JsonSerializer.Serialize(roles); await db.SaveChangesAsync();
        }
        await Grants(true, false);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(aggregateUrl + Id(packed))).StatusCode);
        Assert.False((await c.GetFromJsonAsync<JsonElement>(root + "/barcodes/lookup?value=QA-PACKED")).GetProperty("inventoryAvailable").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(root + "/pages/barcode-lookup")).StatusCode);
        detail = await c.GetFromJsonAsync<JsonElement>(detailUrl);
        Assert.False(detail.GetProperty("canViewCost").GetBoolean());
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("product").GetProperty("costPrice").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync(root + "/barcodes/lookup?value=QA-RACK")).StatusCode);
        await Grants(false, true);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(root + "/pages/barcode-lookup")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(detailUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync(root + "/barcodes/lookup?value=QA-PRODUCT-ALIAS")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/barcodes/locations/" + Id(loc) + "/stock")).StatusCode);
        await Grants(false, false);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/pages/barcode-lookup")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/barcodes/lookup?value=QA-RACK")).StatusCode);
        await Login("Other");
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(aggregateUrl + Id(packed))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/pages/barcode-lookup")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/api/tenants/{other.Id}/barcodes/lookup?value=QA-PRODUCT-ALIAS")).StatusCode);
        Assert.Equal(before, await Snapshot());
        await Grants(true, true);
        if (!string.IsNullOrEmpty(output)) await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { tenant = tenant.Id, password, product = Id(product), warehouse = Id(warehouse), rack = Id(rack), location = Id(loc), emptyProduct = Id(empty) }));
    }
}
