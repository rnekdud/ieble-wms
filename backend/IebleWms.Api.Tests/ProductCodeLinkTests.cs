using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed partial class ProductTests
{
    [Fact]
    public async Task RenamedProductUsesCurrentCodeForQueriesAndPreservesDocumentSnapshotsAndStock()
    {
        // AuthFactory replaces all DB registrations with a private in-memory SQLite database.
        using var factory = new AuthFactory(); using var client = factory.Client();
        var fixture = await Seed(factory); await Login(client, fixture);
        var root = $"/api/tenants/{fixture.Tenant}";
        var request = Request("PR06", "UNCHANGED-BARCODE"); request.Name = "가나디 무드등 가습기";
        var original = await Post(client, fixture.Root, request); var productId = Id(original);
        var warehouse = new Warehouse { TenantId = fixture.Tenant, Code = "WH01", Name = "QA 창고" };
        var partner = new Partner { TenantId = fixture.Tenant, Code = "BP01", NormalizedCode = "BP01", Name = "QA 거래처", Type = "BOTH", CreationRequestId = Guid.NewGuid() };
        var location = new StorageLocation { TenantId = fixture.Tenant, WarehouseId = warehouse.Id, Code = "FLOOR01", Name = "QA 위치" };
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.AddRange(warehouse, partner, location);
            db.Add(new StockBalance { TenantId = fixture.Tenant, ProductId = productId, WarehouseId = warehouse.Id, LocationId = location.Id, SourceKey = "CODE-QA", Quantity = 40, Unit = "EA", LotNumber = "LOT-QA" });
            await db.SaveChangesAsync();
        }
        var receipt = await Post(client, root + "/receipts", new ReceiptRequest {
            RequestId = Guid.NewGuid(), WarehouseId = warehouse.Id, PartnerId = partner.Id, ExpectedDate = new(2026,11,18),
            Lines = [new() { ProductId = productId, ExpectedQuantity = 2, LotNumber = "LOT-QA" }]
        });
        var shipment = await Post(client, root + "/shipments", new ShipmentRequest {
            RequestId = Guid.NewGuid(), WarehouseId = warehouse.Id, PartnerId = partner.Id, RequestDate = new(2026,11,18), ExpectedDate = new(2026,11,18),
            Lines = [new() { ProductId = productId, RequestedQuantity = 2, LotNumber = "LOT-QA" }]
        });
        async Task<string> Snapshot() {
            using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            return JsonSerializer.Serialize(new {
                stock = await db.StockBalances.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                barcodes = await db.StorageBarcodes.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                receipts = await db.InboundReceiptLines.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                shipments = await db.OutboundShipmentLines.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                allocations = await db.ShipmentAllocations.AsNoTracking().OrderBy(x => x.Id).ToListAsync()
            });
        }
        async Task<JsonElement> Get(string path) {
            var response = await client.GetAsync(path); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        var before = await Snapshot();
        var current = (await Get(fixture.Root + "/" + productId)).GetProperty("product");
        request.Version = Version(current); request.Code = "PR10"; request.Barcode = new() { Mode = "keep" };
        var updated = await Post(client, fixture.Root + "/" + productId, request, HttpStatusCode.OK);
        Assert.Equal(productId, Id(updated)); Assert.Equal("PR10", updated.GetProperty("code").GetString());
        Assert.Equal(before, await Snapshot());
        Assert.Equal("PR10", (await Get(fixture.Root + "/" + productId)).GetProperty("product").GetProperty("code").GetString());
        Assert.Equal(0, (await Get(fixture.Root + "?search=PR06")).GetProperty("total").GetInt32());
        Assert.Equal(productId, Id(Assert.Single((await Get(fixture.Root + "?search=PR10")).GetProperty("items").EnumerateArray()).GetProperty("product")));
        foreach (var document in new[] { "receipts", "shipments" }) {
            var item = Assert.Single((await Get($"{root}/{document}/choices?kind=product-table&warehouseId={warehouse.Id}&search=PR10")).GetProperty("items").EnumerateArray());
            Assert.Equal(productId, Id(item)); Assert.Equal("PR10", item.GetProperty("code").GetString());
        }
        var lookup = (await Get(root + "/barcodes/lookup?value=UNCHANGED-BARCODE")).GetProperty("item");
        Assert.Equal(productId, Id(lookup)); Assert.Equal("PR10", lookup.GetProperty("code").GetString());
        foreach (var path in new[] { "/inventory?search=PR10", "/reports/stock-overview?view=location&search=PR10&active=all&status=all" }) {
            var row = Assert.Single((await Get(root + path)).GetProperty("items").EnumerateArray());
            Assert.Equal(productId, row.GetProperty("productId").GetGuid()); Assert.Equal("PR10", row.GetProperty("productCode").GetString()); Assert.Equal(40, row.GetProperty("quantity").GetDecimal());
        }
        var export = await client.GetAsync(root + "/reports/stock-overview/export?view=location&search=PR10&active=all&status=all&format=csv");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode); Assert.Contains("PR10", await export.Content.ReadAsStringAsync());
        foreach (var (document, id) in new[] { ("receipts", Id(receipt.GetProperty("receipt"))), ("shipments", Id(shipment.GetProperty("shipment"))) }) {
            var line = Assert.Single((await Get($"{root}/{document}/{id}")).GetProperty("lines").EnumerateArray());
            Assert.Equal(productId, line.GetProperty("productId").GetGuid()); Assert.Equal("PR06", line.GetProperty("productCode").GetString());
        }
        await Post(client, fixture.Root, Request("PR11"));
        request.Version = Version(updated); request.Code = "pr11";
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(client, fixture.Root + "/" + productId, request)).StatusCode);
        Assert.Equal(before, await Snapshot());
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var changes = await db.ProductChanges.Where(x => x.TargetId == productId).ToListAsync();
            Assert.Contains(changes, x => x.BeforeJson.Contains("PR06") && x.AfterJson.Contains("PR10"));
        }
        await Login(client, fixture, "Other");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(fixture.Root + "/" + productId)).StatusCode);
    }
}
