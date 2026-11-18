using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Warehousing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class RackBarcodeTests
{
    private sealed record Fixture(Guid Tenant, Guid Other, Guid Actor, string Password)
    { public string Root => $"/api/tenants/{Tenant}/warehouses"; }
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "BARCODE", Name = "바코드 기업", BillingStatus = TenantBillingStatus.Paid };
        var other = new Tenant { Code = "OTHER", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid };
        var password = "Barcode1!" + Guid.NewGuid().ToString("N"); Guid actor = default;
        foreach (var (name, owner, role) in new[] { ("Master", tenant, TenantRole.Master), ("Reader", tenant, TenantRole.Employee), ("Other", other, TenantRole.Master) })
        {
            var user = new ApplicationUser { UserName = name, Email = name + "@barcode.test", DisplayName = name };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            db.Add(new TenantMembership { Tenant = owner, User = user, Role = role });
            if (name == "Master") actor = user.Id;
        }
        await db.SaveChangesAsync(); return new(tenant.Id, other.Id, actor, password);
    }
    private static async Task Login(HttpClient client, Fixture fixture, string user = "Master") =>
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = user, password = fixture.Password })).StatusCode);
    private static async Task<JsonElement> Post(HttpClient client, string path, object value, HttpStatusCode expected = HttpStatusCode.Created)
    {
        var response = await AuthTests.Post(client, path, value);
        Assert.True(response.StatusCode == expected, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static Guid Id(JsonElement value) => value.GetProperty("id").GetGuid();
    private static Guid Version(JsonElement value) => value.GetProperty("version").GetGuid();
    private static string? Barcode(JsonElement value) => value.GetProperty("barcode").GetString();
    private static async Task<string> Warehouse(HttpClient client, string root) => root + "/" + Id(await Post(client, root, new { name = "바코드 창고" }));
    private static RackRequest Rack(string code, string mode = "auto", string? value = null) => new() { Code = code, Name = code, Levels = 3, Bays = 4, RequestId = Guid.NewGuid(), Barcode = new() { Mode = mode, Value = value } };

    [Fact]
    public async Task AutomaticCreationReplayRegenerationAuditAndOldClientUpdatesPreserveIdentities()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var root = await Warehouse(c, t.Root);
        var request = Rack("R1"); var rack = await Post(c, root + "/racks", request);
        Assert.Matches("^880[0-9]{17}$", Barcode(rack)!);
        var replay = await Post(c, root + "/racks", request); Assert.Equal(Id(rack), Id(replay)); Assert.Equal(Barcode(rack), Barcode(replay));
        var front = await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front");
        var ids = front.GetProperty("locations").EnumerateArray().Select(x => Id(x.GetProperty("location"))).Order().ToArray(); Assert.Equal(12, ids.Length);
        var replacement = await Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto" } }, HttpStatusCode.OK);
        Assert.NotEqual(Barcode(rack), Barcode(replacement)); Assert.Equal(Id(rack), Id(replacement)); Assert.Equal("R1", replacement.GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto" } })).StatusCode);
        // An old client omitting barcode must retain the label, even while expanding the rack.
        var expanded = await Post(c, $"{root}/racks/{Id(rack)}", new { version = Version(replacement), code = "R1", name = "확장", levels = 4, bays = 4 }, HttpStatusCode.OK);
        Assert.Equal(Barcode(replacement), Barcode(expanded));
        front = await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front"); Assert.Equal(Barcode(replacement), Barcode(front.GetProperty("rack")));
        Assert.All(ids, id => Assert.Contains(front.GetProperty("locations").EnumerateArray(), x => Id(x.GetProperty("location")) == id));
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Single(await db.StorageBarcodes.ToListAsync());
        var audit = await db.WarehouseChanges.Where(x => x.Action == "RackBarcodeChanged").OrderBy(x => x.Id).ToListAsync(); Assert.Equal(2, audit.Count);
        Assert.All(audit, a => { Assert.Equal(t.Actor, a.ChangedByUserId); Assert.Equal(Id(rack), a.TargetId); Assert.True(a.ChangedAt > DateTimeOffset.UtcNow.AddMinutes(-2)); });
        Assert.Equal(Barcode(rack), JsonDocument.Parse(audit[1].BeforeJson).RootElement.GetProperty("barcode").GetString());
        Assert.Equal(Barcode(replacement), JsonDocument.Parse(audit[1].AfterJson).RootElement.GetProperty("barcode").GetString());
    }

    [Fact]
    public async Task ManualInputIsExactAndDuplicatesAreTenantWideWithoutLeakingOtherTenants()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var a = await Warehouse(c, t.Root); var b = await Warehouse(c, t.Root); const string value = "  legacy-Aa/01<&\"'  ";
        var rack = await Post(c, a + "/racks", Rack("R", "manual", value)); Assert.Equal(value, Barcode(rack));
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, b + "/racks", Rack("R", "manual", value))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(c, $"{b}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto" } })).StatusCode);
        var caseVariant = await Post(c, b + "/racks", Rack("LOWER", "manual", value.ToLowerInvariant())); Assert.Equal(value.ToLowerInvariant(), Barcode(caseVariant));
        await Login(c, t, "Other"); var other = await Warehouse(c, $"/api/tenants/{t.Other}/warehouses");
        var same = await Post(c, other + "/racks", Rack("R", "manual", value)); Assert.Equal(value, Barcode(same));
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(a)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"{a}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto" } })).StatusCode);
    }

    [Theory]
    [InlineData(null)][InlineData("")][InlineData("한글")][InlineData("ABC\n")][InlineData("ABC\t")][InlineData("é")][InlineData("ABC\u007f")]
    [InlineData("12345678901234567890123456789012345678901234567890123456789012345")]
    public async Task InvalidManualInputDoesNotCreateRackSlotsOrBarcode(string? value)
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var root = await Warehouse(c, t.Root);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/racks", Rack("BAD", "manual", value))).StatusCode);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.WarehouseRacks.ToListAsync()); Assert.Empty(await db.StorageLocations.ToListAsync()); Assert.Empty(await db.StorageBarcodes.ToListAsync());
    }

    [Fact]
    public async Task OptionalBarcodeRemovalLeavesRackAndLocationsAndReadOnlyUsersCannotWrite()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var root = await Warehouse(c, t.Root);
        var rack = await Post(c, root + "/racks", Rack("NONE", "none")); Assert.Null(Barcode(rack));
        rack = await Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "manual", value = "CUSTOM-01" } }, HttpStatusCode.OK);
        rack = await Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "none" } }, HttpStatusCode.OK); Assert.Null(Barcode(rack));
        await Login(c, t, "Reader"); Assert.Equal(HttpStatusCode.OK, (await c.GetAsync($"{root}/racks/{Id(rack)}/front")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto" } })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, root + "/racks", Rack("NO"))).StatusCode);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Single(await db.WarehouseRacks.ToListAsync()); Assert.Equal(12, await db.StorageLocations.CountAsync()); Assert.Empty(await db.StorageBarcodes.ToListAsync());
    }

    [Fact]
    public async Task SharedLocationNamespaceAndDatabaseConstraintRejectDuplicates()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var root = await Warehouse(c, t.Root);
        var location = await Post(c, root + "/locations", new { name = "바닥", code = "F" });
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new StorageBarcode { TenantId = t.Tenant, WarehouseId = Guid.Parse(root.Split('/').Last()), LocationId = Id(location), Value = "FLOOR-LABEL" }); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/racks", Rack("R", "manual", "FLOOR-LABEL"))).StatusCode);
        var rack = await Post(c, root + "/racks", Rack("R", "none"));
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new StorageBarcode { TenantId = t.Tenant, WarehouseId = Guid.Parse(root.Split('/').Last()), RackId = Id(rack), Value = "FLOOR-LABEL" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        using var verify = f.Services.CreateScope(); var context = verify.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Single(await context.StorageBarcodes.ToListAsync()); Assert.Equal(13, await context.StorageLocations.CountAsync());
    }

    [Fact]
    public async Task AtomicWorkspaceBarcodeFailureRollsBackAndReplayDoesNotRegenerate()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var first = new WorkspaceRackRequest { ClientId = Guid.NewGuid(), Name = "랙1", Code = "R1", Levels = 3, Bays = 4, Barcode = new() { Mode = "manual", Value = "DUPLICATE" } };
        var second = new WorkspaceRackRequest { ClientId = Guid.NewGuid(), Name = "랙2", Code = "R2", Barcode = new() { Mode = "manual", Value = "DUPLICATE" } };
        var request = new SaveWarehouseWorkspaceRequest { RequestId = Guid.NewGuid(), Warehouse = new() { Name = "통합" }, Racks = [first, second] };
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/workspace", request)).StatusCode);
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Empty(await db.Warehouses.ToListAsync()); Assert.Empty(await db.StorageLocations.ToListAsync()); Assert.Empty(await db.StorageBarcodes.ToListAsync()); Assert.Empty(await db.WarehouseChanges.ToListAsync()); }
        request.Racks.Remove(second); first.Barcode = new() { Mode = "auto" }; request.RequestId = Guid.NewGuid();
        var saved = await Post(c, t.Root + "/workspace", request); var root = t.Root + "/" + saved.GetProperty("warehouseId").GetGuid();
        var data = await c.GetFromJsonAsync<JsonElement>(root); var rack = data.GetProperty("racks")[0]; var barcode = Barcode(rack);
        await Post(c, t.Root + "/workspace", request); data = await c.GetFromJsonAsync<JsonElement>(root); Assert.Equal(barcode, Barcode(data.GetProperty("racks")[0]));
        first.Id = Id(rack); first.ClientId = Id(rack); first.Version = Version(rack); first.Barcode = new() { Mode = "manual", Value = "UPDATED-IN-WORKSPACE" };
        request.Warehouse.Version = Version(data.GetProperty("warehouse")); request.RequestId = Guid.NewGuid();
        await Post(c, root + "/workspace", request, HttpStatusCode.OK);
        var front = await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front"); Assert.Equal("UPDATED-IN-WORKSPACE", Barcode(front.GetProperty("rack"))); Assert.Equal(12, front.GetProperty("locations").GetArrayLength());
    }
    [Fact]
    public async Task GeneratedValuesHaveGlobalDatabaseUniquenessAndOwnerForeignKeys()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var root = await Warehouse(c, t.Root); var first = await Post(c, root + "/racks", Rack("R"));
        await Login(c, t, "Other"); var other = await Warehouse(c, $"/api/tenants/{t.Other}/warehouses");
        var second = await Post(c, other + "/racks", Rack("R")); Assert.NotEqual(Barcode(first), Barcode(second));
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var label = await db.StorageBarcodes.SingleAsync(x => x.RackId == Id(second));
            label.Value = Barcode(first)!; await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new StorageBarcode { TenantId = t.Tenant, WarehouseId = Guid.Parse(root.Split('/').Last()), RackId = Id(second), Value = "WRONG-OWNER" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task PreBarcodeWorkspaceReceiptHashesStillReplayWithoutCreatingAnotherLabel()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var request = new SaveWarehouseWorkspaceRequest { RequestId = Guid.NewGuid(), Warehouse = new() { Name = "Legacy" }, Racks = [new() { ClientId = Guid.NewGuid(), Name = "Rack", Code = "R" }] };
        var saved = await Post(c, t.Root + "/workspace", request);
        var legacy = System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(request))!;
        foreach (var row in legacy["Racks"]!.AsArray()) row!.AsObject().Remove("Barcode");
        var oldPayload = new System.Text.Json.Nodes.JsonObject { ["warehouseId"] = null, ["request"] = legacy };
        var oldHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(oldPayload.ToJsonString())));
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var receipt = await db.WarehouseSaveReceipts.SingleAsync();
            receipt.RequestHash = oldHash; await db.SaveChangesAsync();
        }
        var replay = await Post(c, t.Root + "/workspace", request); Assert.Equal(saved.GetProperty("warehouseId").GetGuid(), replay.GetProperty("warehouseId").GetGuid());
        using var check = f.Services.CreateScope(); Assert.Single(await check.ServiceProvider.GetRequiredService<WmsDbContext>().StorageBarcodes.ToListAsync());
    }

    [Fact]
    public async Task CandidatesDoNotWriteUntilSaveAndPreserveExactGeneratedValueAndIdentities()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var root = await Warehouse(c, t.Root); var rack = await Post(c, root + "/racks", Rack("R"));
        var before = await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front");
        var beforeJson = before.GetRawText();
        int audits;
        using (var scope = f.Services.CreateScope()) audits = await scope.ServiceProvider.GetRequiredService<WmsDbContext>().WarehouseChanges.CountAsync();
        var candidates = new List<JsonElement>();
        for (var i = 0; i < 8; i++) candidates.Add(await Post(c, t.Root + "/rack-barcode-candidates", new { }, HttpStatusCode.OK));
        Assert.Equal(candidates.Count, candidates.Select(x => x.GetProperty("value").GetString()).Distinct().Count());
        Assert.Equal(beforeJson, (await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front")).GetRawText());
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            Assert.Single(await db.StorageBarcodes.ToListAsync()); Assert.Single(await db.WarehouseRacks.ToListAsync());
            Assert.Equal(12, await db.StorageLocations.CountAsync()); Assert.Equal(audits, await db.WarehouseChanges.CountAsync());
        }
        var candidate = candidates[0]; var value = candidate.GetProperty("value").GetString(); var proof = candidate.GetProperty("proof").GetString();
        Assert.Matches("^880[0-9]{17}$", value!);
        var saved = await Post(c, $"{root}/racks/{Id(rack)}/barcode", new { version = Version(rack), barcode = new { mode = "auto", value, proof } }, HttpStatusCode.OK);
        Assert.Equal(value, Barcode(saved)); Assert.Equal(Id(rack), Id(saved)); Assert.Equal("R", saved.GetProperty("code").GetString());
        var after = await c.GetFromJsonAsync<JsonElement>($"{root}/racks/{Id(rack)}/front");
        Assert.Equal(before.GetProperty("locations").GetRawText(), after.GetProperty("locations").GetRawText());
        var duplicate = Rack("OTHER"); duplicate.Barcode = new() { Mode = "auto", Value = value, Proof = proof };
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, root + "/racks", duplicate)).StatusCode);
        using var check = f.Services.CreateScope(); var stored = await check.ServiceProvider.GetRequiredService<WmsDbContext>().StorageBarcodes.SingleAsync();
        Assert.True(stored.IsGenerated); Assert.Equal(value, stored.Value);
    }

    [Fact]
    public async Task CandidateProofAndPermissionsPreventCrossTenantOrTamperedSaves()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var candidate = await Post(c, t.Root + "/rack-barcode-candidates", new { }, HttpStatusCode.OK);
        var value = candidate.GetProperty("value").GetString(); var proof = candidate.GetProperty("proof").GetString();
        var root = await Warehouse(c, t.Root);
        foreach (var invalid in new RackBarcodeChange[] { new() {Mode="auto", Value=value, Proof="!invalid"}, new() {Mode="auto", Value=value}, new() {Mode="auto", Value=value+"X", Proof=proof} })
        {
            var request = Rack("BAD"); request.Barcode=invalid;
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/racks", request)).StatusCode);
        }
        await Login(c, t, "Reader");
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, t.Root + "/rack-barcode-candidates", new { })).StatusCode);
        await Login(c, t, "Other");
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, t.Root + "/rack-barcode-candidates", new { })).StatusCode);
        var other = await Warehouse(c, $"/api/tenants/{t.Other}/warehouses"); var foreign = Rack("FOREIGN"); foreign.Barcode=new() {Mode="auto", Value=value, Proof=proof};
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, other + "/racks", foreign)).StatusCode);
        using var scope=f.Services.CreateScope(); var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.WarehouseRacks.ToListAsync()); Assert.Empty(await db.StorageLocations.ToListAsync()); Assert.Empty(await db.StorageBarcodes.ToListAsync());
    }

    [Fact]
    public async Task CandidateSurvivesAtomicWorkspaceSaveAndReplay()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t);
        var candidate = await Post(c, t.Root + "/rack-barcode-candidates", new { }, HttpStatusCode.OK);
        var value = candidate.GetProperty("value").GetString(); var proof = candidate.GetProperty("proof").GetString();
        using (var scope = f.Services.CreateScope()) { var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Empty(await db.Warehouses.ToListAsync()); Assert.Empty(await db.StorageBarcodes.ToListAsync()); }
        var request = new SaveWarehouseWorkspaceRequest { RequestId=Guid.NewGuid(), Warehouse=new() { Name="Candidate" }, Racks=[new() {ClientId=Guid.NewGuid(), Code="R", Name="랙", Levels=3, Bays=4, Barcode=new() {Mode="auto", Value=value, Proof=proof}}] };
        var saved=await Post(c,t.Root+"/workspace",request); var replay=await Post(c,t.Root+"/workspace",request);
        Assert.Equal(saved.GetProperty("warehouseId").GetGuid(), replay.GetProperty("warehouseId").GetGuid());
        using var check=f.Services.CreateScope(); var context=check.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(value,(await context.StorageBarcodes.SingleAsync()).Value); Assert.Equal(12,await context.StorageLocations.CountAsync());
    }

    [Fact]
    public async Task ConcurrentCandidateGenerationUsesIndependentConnectionsAndDoesNotReserveRows()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f);
        // AuthFactory shares one SQLite connection, so use a shared-memory copy with a connection per worker.
        var connectionString = $"Data Source=candidates-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        using var anchor = new SqliteConnection(connectionString); await anchor.OpenAsync();
        using (var scope = f.Services.CreateScope())
            ((SqliteConnection)scope.ServiceProvider.GetRequiredService<WmsDbContext>().Database.GetDbConnection()).BackupDatabase(anchor);
        var generator=f.Services.GetRequiredService<RackBarcodeCandidates>();
        var values=await Task.WhenAll(Enumerable.Range(0,32).Select(i => Task.Run(async () => {
            using var scope=f.Services.CreateScope();
            var options=new DbContextOptionsBuilder<WmsDbContext>().UseSqlite(connectionString).ReplaceService<IModelCustomizer,SqliteTimestampModelCustomizer>().Options;
            await using var db=new WmsDbContext(options,scope.ServiceProvider.GetRequiredService<IAuditActor>(),TimeProvider.System);
            return await generator.Generate(db,i%2==0?t.Tenant:t.Other,CancellationToken.None);
        })));
        Assert.Equal(32,values.Select(x=>x.Value).Distinct().Count());
        using var command=anchor.CreateCommand(); command.CommandText="SELECT COUNT(*) FROM StorageBarcodes";
        Assert.Equal(0L,await command.ExecuteScalarAsync());
    }

}
