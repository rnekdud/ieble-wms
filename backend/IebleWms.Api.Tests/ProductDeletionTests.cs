using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ProductTests
{
    static ProductDeleteRequest DeleteRequest(params JsonElement[] products) => new() { Items = products.Select(p => new ProductDeleteTarget(Id(p), Version(p))).ToArray() };

    [Fact] public async Task ProductDeletionRemovesOnlyUnusedSelectedProductsAndOwnedAssetsWithAudit()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var r = Request("DELETE-A", "DELETE-LABEL"); r.Image = new() { FileName = "sample.png", Base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" };
        var a = await Post(c, t.Root, r); var b = await Post(c, t.Root, Request("DELETE-B")); var keep = await Post(c, t.Root, Request("KEEP", "KEEP-LABEL"));
        var request = DeleteRequest(a, b);
        var check = await Post(c, t.Root + "/delete-check", request, HttpStatusCode.OK); Assert.True(check.GetProperty("canDelete").GetBoolean());
        Assert.Equal(2, (await Post(c, t.Root + "/delete", request, HttpStatusCode.OK)).GetProperty("deletedCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, t.Root + "/delete", request)).StatusCode);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(Id(keep), (await db.Products.SingleAsync()).Id); Assert.Empty(await db.ProductImages.ToListAsync());
        Assert.Equal("KEEP-LABEL", (await db.StorageBarcodes.SingleAsync()).Value);
        var audit = await db.ProductChanges.Where(x => x.Action == "ProductDeleted").ToListAsync(); Assert.Equal(2, audit.Count); Assert.All(audit, x => Assert.Equal(t.Actor, x.ChangedByUserId));
        db.Products.Remove(await db.Products.SingleAsync()); await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Fact] public async Task ProductDeletionChecksVersionsTenantPermissionsAndBlocksTheEntireBatch()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var a = await Post(c, t.Root, Request("SAFE")); var b = await Post(c, t.Root, Request("USED"));
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); await using var tx = await db.Database.BeginTransactionAsync(); await scope.ServiceProvider.GetRequiredService<ProductUsagePolicy>().LockForInventory(t.Tenant, Id(b)); await tx.CommitAsync(); }
        b = (await c.GetFromJsonAsync<JsonElement>(t.Root + "/" + Id(b))).GetProperty("product");
        var review = await Post(c, t.Root + "/delete-check", DeleteRequest(a, b), HttpStatusCode.OK); Assert.False(review.GetProperty("canDelete").GetBoolean());
        Assert.Contains(review.GetProperty("items").EnumerateArray(), x => x.GetProperty("canDelete").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/delete", DeleteRequest(a, b))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/" + Id(a) + "/delete", new { version = Guid.NewGuid() })).StatusCode);
        await Login(c, t, "Reader"); foreach (var path in new[] { "/delete-check", "/delete" }) Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, t.Root + path, DeleteRequest(a))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, t.Root + "/" + Id(a) + "/delete", new { version = Version(a) })).StatusCode);
        await Login(c, t, "Other"); Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, $"/api/tenants/{t.Other}/products/delete", DeleteRequest(a))).StatusCode);
        await Login(c, t); Assert.Equal(1, (await Post(c, t.Root + "/" + Id(a) + "/delete", new { version = Version(a) }, HttpStatusCode.OK)).GetProperty("deletedCount").GetInt32());
        using var verify = f.Services.CreateScope(); Assert.Equal(Id(b), (await verify.ServiceProvider.GetRequiredService<WmsDbContext>().Products.SingleAsync()).Id);
    }

    [Fact] public async Task SystemClassificationIsReadOnlyTenantScopedLazyAndCompatibleWithExistingNames()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); db.ProductTypes.Add(new() { TenantId = t.Tenant, Name = "완제품", NormalizedName = "완제품" }); await db.SaveChangesAsync(); }
        var options = await c.GetFromJsonAsync<JsonElement>(t.Root + "/options");
        Assert.Equal(12, options.GetProperty("categories").EnumerateArray().Count(x => x.GetProperty("parentId").ValueKind == JsonValueKind.Null));
        Assert.Equal(13, options.GetProperty("productTypes").GetArrayLength());
        var legacyType = options.GetProperty("productTypes").EnumerateArray().Single(x => !x.GetProperty("isSystem").GetBoolean());
        var stopped = await Post(c, t.Root + "/types/" + Id(legacyType), new { name = "완제품", version = Version(legacyType), isActive = false }, HttpStatusCode.OK);
        Assert.False(stopped.GetProperty("isActive").GetBoolean());
        using (var scope = f.Services.CreateScope()) Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().ProductCategories.ToListAsync());
        var leaf = DefaultProductClassification.CategoryRows(t.Tenant).Single(x => x.Name == "원재료");
        var type = DefaultProductClassification.TypeRows(t.Tenant).Single(x => x.Name == "원자재");
        var r = Request("DEFAULT"); r.CategoryId = leaf.Id; r.ProductTypeId = type.Id; var product = await Post(c, t.Root, r); await Post(c, t.Root, r);
        r.Version = Version(product); await Post(c, t.Root + "/" + Id(product), r, HttpStatusCode.OK);
        var root = DefaultProductClassification.CategoryRows(t.Tenant).Single(x => x.Name == "식품·음료");
        Assert.Equal(1, (await c.GetFromJsonAsync<JsonElement>(t.Root + "?categoryId=" + root.Id)).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/categories/" + leaf.Id, new { name = "변경", version = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/types", new { name = "원자재" })).StatusCode);
        await Post(c, t.Root + "/categories", new { name = "기업 전용 식재료", parentId = root.Id }, HttpStatusCode.OK);
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(4, await db.ProductCategories.CountAsync()); Assert.Equal(2, await db.ProductTypes.CountAsync()); }
        await Login(c, t, "Other"); var otherOptions = await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Other}/products/options");
        Assert.DoesNotContain(otherOptions.GetProperty("categories").EnumerateArray(), x => Id(x) == leaf.Id || x.GetProperty("name").GetString() == "기업 전용 식재료");
        r.RequestId = Guid.NewGuid(); Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, $"/api/tenants/{t.Other}/products", r)).StatusCode);
    }
}

public sealed partial class ReceiptTests
{
    [Fact] public async Task ProductDeletionProtectsReceiptStockAndMovementReferencesIncludingZeroStock()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); var s = await Setup(f, t); await Login(c, t);
        var d = await Ready(c, t, s); await Post(c, t.Root + "/" + Id(Doc(d)) + "/confirm", new { version = Version(Doc(d)) }, HttpStatusCode.OK);
        var root = $"/api/tenants/{t.Tenant}/products";
        async Task<JsonElement> Review() { var p = (await c.GetFromJsonAsync<JsonElement>(root + "/" + s.Bulk)).GetProperty("product"); return await Post(c, root + "/delete-check", new ProductDeleteRequest { Items = [new(s.Bulk, Version(p))] }, HttpStatusCode.OK); }
        var review = await Review(); Assert.Contains("현재 재고", review.ToString()); Assert.Contains("입고", review.ToString());
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var stock = await db.StockBalances.SingleAsync(); stock.Quantity = 0; await db.SaveChangesAsync(); }
        review = await Review(); Assert.False(review.GetProperty("canDelete").GetBoolean()); Assert.Contains("변동 이력", review.ToString());
        var p = (await c.GetFromJsonAsync<JsonElement>(root + "/" + s.Bulk)).GetProperty("product");
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/" + s.Bulk + "/delete", new { version = Version(p) })).StatusCode);
        using var verify = f.Services.CreateScope(); var context = verify.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Single(await context.StockMovements.ToListAsync()); Assert.Single(await context.InboundReceiptLines.ToListAsync());
    }
}
