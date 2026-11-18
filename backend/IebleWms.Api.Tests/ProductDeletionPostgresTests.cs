using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ProductTests
{
    [ScanPostgresFact] public async Task PostgresProductDeletionConcurrencyClassificationAndIsolation()
    {
        using var f = new ScanPostgresFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var defaults = DefaultProductClassification.CategoryRows(t.Tenant);
        var leaf = defaults.Single(x => x.Name == "원재료"); var type = DefaultProductClassification.TypeRows(t.Tenant).Single(x => x.Name == "원자재");
        var products = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => { var r = Request("CONCURRENT-" + i); r.CategoryId = leaf.Id; r.ProductTypeId = type.Id; return Post(c, t.Root, r); }));
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(3, await db.ProductCategories.CountAsync(x => x.TenantId == t.Tenant)); Assert.Equal(1, await db.ProductTypes.CountAsync(x => x.TenantId == t.Tenant)); }

        // A business writer wins the tenant lock, then commits a real receipt reference while deletion waits.
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); await using var tx = await db.Database.BeginTransactionAsync();
            var p = await scope.ServiceProvider.GetRequiredService<ProductUsagePolicy>().LockForInventory(t.Tenant, Id(products[0]));
            var warehouse = new Warehouse { TenantId = t.Tenant, Code = "QA-WH", Name = "삭제 검증 창고" };
            var partner = new Partner { TenantId = t.Tenant, Code = "QA-P", NormalizedCode = "QA-P", Name = "삭제 검증 거래처", CreationRequestId = Guid.NewGuid() };
            var receipt = new InboundReceipt { TenantId = t.Tenant, Number = "QA-IN-001", WarehouseId = warehouse.Id, PartnerId = partner.Id, ExpectedDate = new(2026, 11, 6), RequestId = Guid.NewGuid() };
            db.AddRange(warehouse, partner, receipt, new InboundReceiptLine { TenantId = t.Tenant, ReceiptId = receipt.Id, ProductId = p.Id, ProductCode = p.Code, ProductName = p.Name, ExpectedQuantity = 1 });
            await db.SaveChangesAsync();
            var deletion = AuthTests.Post(c, t.Root + "/delete", DeleteRequest(products[0], products[1]));
            await Task.Delay(150); Assert.False(deletion.IsCompleted);
            await tx.CommitAsync(); Assert.Equal(HttpStatusCode.Conflict, (await deletion).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(t.Root + "/" + Id(products[1]))).StatusCode);
        var current = (await c.GetFromJsonAsync<JsonElement>(t.Root + "/" + Id(products[0]))).GetProperty("product");
        var blocked = await Post(c, t.Root + "/delete-check", DeleteRequest(current), HttpStatusCode.OK); Assert.Contains("입고", blocked.ToString());
        var simultaneous = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => AuthTests.Post(c, t.Root + "/delete", DeleteRequest(products[1], products[2]))));
        Assert.Single(simultaneous, x => x.StatusCode == HttpStatusCode.OK); Assert.Equal(7, simultaneous.Count(x => x.StatusCode == HttpStatusCode.NotFound));
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(4, await db.Products.CountAsync(x => x.TenantId == t.Tenant)); Assert.Equal(2, await db.ProductChanges.CountAsync(x => x.TenantId == t.Tenant && x.Action == "ProductDeleted")); Assert.Single(await db.InboundReceiptLines.Where(x => x.TenantId == t.Tenant).ToListAsync()); }
        await Login(c, t, "Reader"); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, t.Root + "/delete", DeleteRequest(products[3]))).StatusCode);
        await Login(c, t, "Other"); Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, $"/api/tenants/{t.Other}/products/delete", DeleteRequest(products[3]))).StatusCode);
        var other = await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Other}/products/options"); Assert.DoesNotContain(other.GetProperty("categories").EnumerateArray(), x => Id(x) == leaf.Id);
        await Login(c, t);
        // Isolated QA fixtures only: keep enough products for real Chrome page-selection and deletion checks.
        for (var i = 0; i < 20; i++) await Post(c, t.Root, Request("UI-" + i.ToString("D2")));
        var custom = await Post(c, t.Root + "/categories", new { name = "기업 전용 분류" }, HttpStatusCode.OK);
        var output = Environment.GetEnvironmentVariable("WMS_PRODUCT_QA_FIXTURE");
        if (!string.IsNullOrEmpty(output)) await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { tenant = t.Tenant, password = t.Password, login = "Master", usedProduct = Id(products[0]), safeProduct = Id(products[3]), customCategory = Id(custom) }));
    }
}
