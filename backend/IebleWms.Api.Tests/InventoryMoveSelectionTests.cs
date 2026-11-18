using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed partial class InventoryTests
{
    [Fact]
    public async Task CascadingMoveChoicesAndRackTransfers()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        await MoveSelectionScenario(f, c, false);
    }

    [ScanPostgresFact]
    public async Task PostgresMoveSelectionReservationsConcurrencyAndRollback()
    {
        using var f = new ScanPostgresFactory(); using var c = f.Client();
        await MoveSelectionScenario(f, c, true);
    }

    static async Task MoveSelectionScenario(WebApplicationFactory<Program> f, HttpClient c, bool concurrent)
    {
        var t = await Seed(f); var s = await Setup(f, t); await Login(c, t);
        var root = $"/api/tenants/{t.Tenant}";
        async Task<JsonElement> Get(string path) { var r = await c.GetAsync(path); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
        async Task<JsonElement[]> Choices(string kind, Guid? w = null, Guid? rack = null, Guid? loc = null, string term = "", int page = 1, Guid? product = null)
            => (await Get(Inventory(t) + $"/choices?kind={kind}&productId={product ?? s.Bulk}&warehouseId={w}&rackId={rack}&locationId={loc}&search={Uri.EscapeDataString(term)}&page={page}")).GetProperty("items").EnumerateArray().ToArray();
        async Task<(Guid rack, Guid[] locations)> Rack(Guid w, string code, int bays = 2)
        {
            var rack = await Post(c, root + $"/warehouses/{w}/racks", new { code, name = code + " 이름", levels = 1, bays });
            var front = await Get(root + $"/warehouses/{w}/racks/{Id(rack)}/front");
            return (Id(rack), front.GetProperty("locations").EnumerateArray().Select(l => Id(l.GetProperty("location"))).ToArray());
        }
        var a = await Rack(s.Warehouse, "A"); var b = await Rack(s.Warehouse, "B");
        var target = await Target(f, t, s, true); var other = await Rack(target.warehouse, "C");
        var inactive = await Rack(s.Warehouse, "OFF"); var paged = await Rack(s.Warehouse, "PAGED", 32);
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.WarehouseRacks.SingleAsync(r => r.Id == inactive.rack)).IsActive = false;
            (await db.StorageLocations.SingleAsync(l => l.Id == b.locations[1])).IsActive = false;
            db.StorageBarcodes.Add(new() { TenantId = t.Tenant, WarehouseId = s.Warehouse, LocationId = a.locations[0], Value = "MOVE-LOCATION-BARCODE" });
            await db.SaveChangesAsync();
        }
        async Task<JsonElement> Add(Guid location, decimal qty, string lot, Guid? product = null, string? serial = null)
            => await Post(c, Inventory(t) + "/adjust", new InventoryRequest { RequestId = Guid.NewGuid(), ProductId = product ?? s.Bulk, WarehouseId = s.Warehouse, LocationId = location, Quantity = qty, LotNumber = lot, ExpiryDate = new(2027, 6, 1), SerialNumber = serial, Increase = true, Reason = "Isolated move QA", OccurredAt = DateTimeOffset.UtcNow });
        await Add(a.locations[0], 100, "LOT-A"); await Add(a.locations[0], 5, "LOT-B");
        await Add(s.Location, 2, "FLOOR"); await Add(a.locations[0], 1, "SERIAL-LOT", s.Serial, "SERIAL-MOVE");
        var shipmentRequest = OutRequest(s, 30); shipmentRequest.Lines[0].LotNumber = "LOT-A";
        var shipment = await Post(c, Root(t), shipmentRequest);
        var rows = await Choices("move-stocks", s.Warehouse, a.rack, a.locations[0]);
        Assert.Equal(2, rows.Length); var selected = rows.Single(r => r.GetProperty("name").GetString()!.Contains("LOT-A"));
        Assert.Equal(100, selected.GetProperty("quantity").GetDecimal()); Assert.Equal(30, selected.GetProperty("reservedQuantity").GetDecimal()); Assert.Equal(70, selected.GetProperty("availableQuantity").GetDecimal());
        Assert.Single(await Choices("move-source-warehouses")); Assert.Equal(2, (await Choices("move-source-racks", s.Warehouse)).Length);
        Assert.Single(await Choices("move-source-racks", s.Warehouse, term: "이름"));
        Assert.Equal(Guid.Empty, Id(Assert.Single(await Choices("move-source-racks", s.Warehouse, term: "바닥"))));
        Assert.Single(await Choices("move-source-locations", s.Warehouse, Guid.Empty));
        Assert.Single(await Choices("move-source-locations", s.Warehouse, a.rack));
        var location = Assert.Single(await Choices("move-locations", s.Warehouse, a.rack, term: "MOVE-LOCATION-BARCODE"));
        Assert.Equal(a.locations[0], Id(location)); Assert.Equal(1, location.GetProperty("level").GetInt32()); Assert.Equal(1, location.GetProperty("bay").GetInt32());
        Assert.Empty(await Choices("move-locations", target.warehouse, a.rack)); Assert.Empty(await Choices("move-source-racks", target.warehouse));
        Assert.Empty(await Choices("move-locations", s.Warehouse));
        Assert.Single(await Choices("move-locations", s.Warehouse, b.rack)); Assert.Empty(await Choices("move-locations", s.Warehouse, inactive.rack));
        Assert.DoesNotContain(await Choices("move-racks", s.Warehouse), r => Id(r) == inactive.rack);
        Assert.Equal(30, (await Choices("move-locations", s.Warehouse, paged.rack)).Length); Assert.Equal(2, (await Choices("move-locations", s.Warehouse, paged.rack, page: 2)).Length);
        Assert.Single(await Choices("move-source-warehouses", product: s.Serial));
        Assert.Empty(await Choices("move-source-warehouses", product: Guid.NewGuid()));
        var source = (await Get(Inventory(t) + "/" + Id(selected))).GetProperty("stock");
        var request = Input(source, 71); request.WarehouseId = s.Warehouse; request.LocationId = b.locations[0];
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Inventory(t) + "/move", request)).StatusCode);
        foreach (var bad in new[] { a.locations[0], b.locations[1], inactive.locations[0], s.OtherLocation })
        {
            request.LocationId = bad; request.Quantity = 1;
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Inventory(t) + "/move", request)).StatusCode);
        }
        // Existing location hierarchy and saved layout stay unchanged while all stock projections refresh.
        var wr = root + $"/warehouses/{s.Warehouse}";
        await Post(c, wr + "/plan", new { version = Guid.Empty, schemaVersion = 1, aspectRatio = 1.5, objects = new[] { new { id = Guid.NewGuid(), type = "rack", label = "A", x = .2, y = .5, width = .2, height = .15, rotation = 0, fill = "#a7ccdf", shape = "rectangle", rackId = a.rack }, new { id = Guid.NewGuid(), type = "rack", label = "B", x = .6, y = .5, width = .2, height = .15, rotation = 0, fill = "#a7ccdf", shape = "rectangle", rackId = b.rack } } }, HttpStatusCode.OK);
        var layout = (await Get(wr + "/workspace")).ToString();
        request.LocationId = b.locations[0]; request.Quantity = 20;
        var moved = await Post(c, Inventory(t) + "/move", request); var op = Operation(moved);
        Assert.Equal(2, moved.GetProperty("movements").GetArrayLength()); Assert.Contains(" / A / ", op.GetProperty("sourceLabel").GetString()); Assert.Contains(" / B / ", op.GetProperty("destinationLabel").GetString());
        Assert.Equal(Id(op), Id(Operation(await Post(c, Inventory(t) + "/move", request))));
        foreach (var (w, loc) in new[] { (s.Warehouse, a.locations[1]), (target.warehouse, other.locations[0]) })
        {
            source = (await Get(Inventory(t) + "/" + Id(selected))).GetProperty("stock");
            request = Input(source, 10); request.WarehouseId = w; request.LocationId = loc; await Post(c, Inventory(t) + "/move", request);
        }
        var serial = Assert.Single(await Choices("move-stocks", s.Warehouse, a.rack, a.locations[0], product: s.Serial));
        var serialStock = (await Get(Inventory(t) + "/" + Id(serial))).GetProperty("stock");
        request = Input(serialStock); request.WarehouseId = target.warehouse; request.LocationId = other.locations[0];
        var serialResult = Operation(await Post(c, Inventory(t) + "/move", request)); Assert.Equal(Id(serial), serialResult.GetProperty("destinationStockId").GetGuid());
        Assert.Equal("SERIAL-MOVE", serialResult.GetProperty("serialNumber").GetString()); Assert.Equal("SERIAL-LOT", serialResult.GetProperty("lotNumber").GetString()); Assert.Equal("2027-06-01", serialResult.GetProperty("expiryDate").GetString());
        var rackStock = await Get(wr + $"/racks/{b.rack}/stock?locationId={b.locations[0]}"); Assert.Equal(20, rackStock.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        var dashboard = await Get(root + $"/dashboard/warehouses/{s.Warehouse}?rackId={b.rack}&locationId={b.locations[0]}"); Assert.Equal(20, dashboard.GetProperty("detail").GetProperty("stock").GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        Assert.Equal(layout, (await Get(wr + "/workspace")).ToString());
        if (concurrent)
        {
            source = (await Get(Inventory(t) + "/" + Id(selected))).GetProperty("stock");
            request = Input(source, 1); request.WarehouseId = s.Warehouse; request.LocationId = b.locations[0];
            var replays = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Post(c, Inventory(t) + "/move", request)));
            Assert.Single(replays.Select(x => Id(Operation(x))).Distinct());
            source = (await Get(Inventory(t) + "/" + Id(selected))).GetProperty("stock");
            var races = Enumerable.Range(0, 6).Select(_ => { var r = Input(source, 1); r.WarehouseId = s.Warehouse; r.LocationId = b.locations[0]; return AuthTests.Post(c, Inventory(t) + "/move", r); }).ToArray();
            var results = await Task.WhenAll(races); Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created); Assert.Equal(5, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
            // Outbound reservation and move compete for the same available quantity.
            source = (await Get(Inventory(t) + "/" + Id(selected))).GetProperty("stock");
            request = Input(source, 28); request.WarehouseId = target.warehouse; request.LocationId = other.locations[0];
            var reserve = OutRequest(s, 55); reserve.Lines[0].LotNumber = "LOT-A";
            var clash = await Task.WhenAll(AuthTests.Post(c, Inventory(t) + "/move", request), AuthTests.Post(c, Root(t), reserve));
            Assert.Single(clash, r => r.StatusCode == HttpStatusCode.Created); Assert.Single(clash, r => r.StatusCode == HttpStatusCode.Conflict);
        }
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var balances = await db.StockBalances.Where(x => x.TenantId == t.Tenant).ToListAsync(); Assert.Equal(107, balances.Where(x => x.ProductId == s.Bulk).Sum(x => x.Quantity)); Assert.All(balances, x => Assert.True(x.Quantity >= x.ReservedQuantity));
            Assert.All(balances.Where(x => x.LotNumber == "LOT-A"), x => Assert.Equal(new DateOnly(2027, 6, 1), x.ExpiryDate));
            Assert.All(await db.InventoryOperations.Where(x => x.TenantId == t.Tenant).ToListAsync(), x => Assert.Equal(t.Actor, x.ActorId));
            Assert.Equal(await db.InventoryOperations.CountAsync(x => x.TenantId == t.Tenant), await db.InventoryChanges.CountAsync(x => x.TenantId == t.Tenant));
        }
        // Inject an invalid audit actor after both move balances are changed.
        var rollbackChoice = Assert.Single(await Choices("move-stocks", s.Warehouse, a.rack, a.locations[0], term: "LOT-B"));
        var rollbackSource = (await Get(Inventory(t) + "/" + Id(rollbackChoice))).GetProperty("stock");
        var failedActor = Guid.NewGuid();
        var rollback = Input(rollbackSource, 1); rollback.WarehouseId = s.Warehouse; rollback.LocationId = b.locations[0];
        var before = (await Get(Inventory(t))).ToString();
        var historyBefore = (await Get(Inventory(t) + "/history")).ToString();
        using (var scope = f.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IebleWms.Api.Inventory.InventoryService>();
            await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(() => service.Execute(t.Tenant, failedActor, rollback, true, default));
        }
        Assert.Equal(before, (await Get(Inventory(t))).ToString());
        Assert.Equal(historyBefore, (await Get(Inventory(t) + "/history")).ToString());
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            Assert.False(await db.InventoryChanges.AnyAsync(x => x.TenantId == t.Tenant && x.ActorId == failedActor));
            Assert.False(await db.StockMovements.AnyAsync(x => x.TenantId == t.Tenant && x.ActorId == failedActor));
            (await db.Warehouses.SingleAsync(x => x.Id == target.warehouse)).IsActive = false;
            await db.SaveChangesAsync();
        }
        Assert.DoesNotContain(await Choices("move-warehouses"), x => Id(x) == target.warehouse);
        Assert.Empty(await Choices("move-racks", target.warehouse));
        rollback.LocationId = other.locations[0]; rollback.WarehouseId = target.warehouse;
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, Inventory(t) + "/move", rollback)).StatusCode);
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.Warehouses.SingleAsync(x => x.Id == target.warehouse)).IsActive = true;
            await db.SaveChangesAsync();
        }
        await Login(c, t, "Reader"); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, Inventory(t) + "/move", request)).StatusCode);
        await Login(c, t, "Other"); Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(Inventory(t) + "/choices?kind=move-products")).StatusCode);
        Assert.Equal(0, (await Get($"/api/tenants/{t.Other}/inventory/choices?kind=move-source-warehouses&productId={s.Bulk}")).GetProperty("total").GetInt32());
        await Login(c, t);
        var output = Environment.GetEnvironmentVariable("WMS_MOVE_QA_FIXTURE");
        if (concurrent && !string.IsNullOrEmpty(output)) await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { tenant = t.Tenant, password = t.Password, warehouse = s.Warehouse, product = s.Bulk, sourceRack = a.rack, sourceLocation = a.locations[0], targetRack = b.rack, targetLocation = b.locations[0], otherWarehouse = target.warehouse, otherRack = other.rack, otherLocation = other.locations[0] }));
    }
}
