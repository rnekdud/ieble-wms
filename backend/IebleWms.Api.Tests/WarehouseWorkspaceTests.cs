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
public sealed class WarehouseWorkspaceTests
{
    private sealed record Fixture(Guid Tenant, Guid Foreign, string Password)
    { public string Root => $"/api/tenants/{Tenant}/warehouses"; }
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "WORKSPACE", Name = "통합 기업", BillingStatus = TenantBillingStatus.Paid };
        var foreign = new Tenant { Code = "FOREIGN", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid };
        var password = "Workspace1!" + Guid.NewGuid().ToString("N");
        foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee })
        {
            var u = new ApplicationUser { UserName = role.ToString(), Email = role + "@workspace.test", DisplayName = role.ToString() };
            Assert.True((await users.CreateAsync(u, password)).Succeeded);
            db.Add(new TenantMembership { Tenant = tenant, User = u, Role = role });
        }
        db.Add(foreign); await db.SaveChangesAsync(); return new(tenant.Id, foreign.Id, password);
    }
    private static async Task Login(HttpClient c, Fixture f, string role = "Master") => Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/login", new { email = role, password = f.Password })).StatusCode);
    private static PlanObjectDto Object(string type, Guid? zone = null, Guid? rack = null, Guid? floor = null) => new() { Id = Guid.NewGuid(), Type = type, Label = type, Width = .2, Height = .2, X = .3, Y = .4, ZoneId = zone, RackId = rack, LocationId = floor };
    private static SaveWarehouseWorkspaceRequest Draft(bool structure = true)
    {
        var req = new SaveWarehouseWorkspaceRequest { RequestId = Guid.NewGuid(), Warehouse = new() { Name = "통합 창고", CustomCode = "OWN" } };
        if (!structure) return req;
        var zone = new WorkspaceStructureRequest { ClientId = Guid.NewGuid(), Name = "구역", Code = "A" };
        var rack = new WorkspaceRackRequest { ClientId = Guid.NewGuid(), Name = "랙", Code = "R", Levels = 3, Bays = 4, ZoneClientId = zone.ClientId };
        var floor = new WorkspaceFloorRequest { ClientId = Guid.NewGuid(), Name = "바닥", Code = "F", ZoneClientId = zone.ClientId };
        req.Zones.Add(zone); req.Racks.Add(rack); req.FloorLocations.Add(floor);
        req.Plan = new() { Objects = [Object("zone", zone.ClientId), Object("rack", rack: rack.ClientId), Object("shape", floor: floor.ClientId)] };
        return req;
    }
    private static async Task<WarehouseWorkspaceSaved> Save(HttpClient c, string url, SaveWarehouseWorkspaceRequest req, HttpStatusCode expected = HttpStatusCode.Created)
    {
        var res = await AuthTests.Post(c, url, req); Assert.True(res.StatusCode == expected, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<WarehouseWorkspaceSaved>())!;
    }
    private static async Task<SaveWarehouseWorkspaceRequest> Edit(HttpClient c, string url)
    {
        var data = await c.GetFromJsonAsync<JsonElement>(url + "/workspace"); var detail = data.GetProperty("detail");
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var warehouse = detail.GetProperty("warehouse").Deserialize<Warehouse>(options)!;
        WorkspaceStructureRequest Common(JsonElement value) => new() { ClientId = value.GetProperty("id").GetGuid(), Id = value.GetProperty("id").GetGuid(), Version = value.GetProperty("version").GetGuid(), Name = value.GetProperty("name").GetString()!, Code = value.GetProperty("code").GetString()!, IsActive = value.GetProperty("isActive").GetBoolean() };
        var zones = detail.GetProperty("zones").EnumerateArray().Select(Common).ToList();
        var racks = detail.GetProperty("racks").EnumerateArray().Select(v => { var s = Common(v); return new WorkspaceRackRequest { ClientId = s.ClientId, Id = s.Id, Version = s.Version, Name = s.Name, Code = s.Code, IsActive = s.IsActive, ZoneClientId = v.GetProperty("zoneId").ValueKind == JsonValueKind.Null ? null : v.GetProperty("zoneId").GetGuid(), Levels = v.GetProperty("levels").GetInt32(), Bays = v.GetProperty("bays").GetInt32() }; }).ToList();
        var floors = data.GetProperty("floorLocations").EnumerateArray().Select(v => { var s = Common(v); return new WorkspaceFloorRequest { ClientId = s.ClientId, Id = s.Id, Version = s.Version, Name = s.Name, Code = s.Code, IsActive = s.IsActive, ZoneClientId = v.GetProperty("zoneId").ValueKind == JsonValueKind.Null ? null : v.GetProperty("zoneId").GetGuid() }; }).ToList();
        var p = data.GetProperty("plan");
        return new() { RequestId = Guid.NewGuid(), Warehouse = new() { Version = warehouse.Version, Code = warehouse.Code, Name = warehouse.Name, CustomCode = warehouse.CustomCode, IsActive = warehouse.IsActive }, Zones = zones, Racks = racks, FloorLocations = floors, Plan = p.GetProperty("exists").GetBoolean() ? new() { Version = p.GetProperty("version").GetGuid(), Objects = p.GetProperty("objects").Deserialize<List<PlanObjectDto>>(options)! } : null };
    }
    [Fact]
    public async Task AtomicCreateMapsClientIdsAndGeneratesTwelveSlotsAndFloorThenReplaysExactlyOnce()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var req = Draft();
        Assert.Equal(0, (await c.GetFromJsonAsync<JsonElement>(t.Root)).GetProperty("total").GetInt32());
        var result = await Save(c, t.Root + "/workspace", req); Assert.Equal("WH-0001", result.Code);
        Assert.NotEqual(req.Zones[0].ClientId, result.Zones[req.Zones[0].ClientId]); Assert.Equal(12, result.RackLocations.Count);
        Assert.Equal(result.WarehouseId, (await Save(c, t.Root + "/workspace", req)).WarehouseId);
        var loaded = await Edit(c, t.Root + "/" + result.WarehouseId);
        Assert.Equal(result.Zones[req.Zones[0].ClientId], loaded.Plan!.Objects[0].ZoneId);
        Assert.Equal(result.Racks[req.Racks[0].ClientId], loaded.Plan.Objects[1].RackId);
        Assert.Equal(result.FloorLocations[req.FloorLocations[0].ClientId], loaded.Plan.Objects[2].LocationId);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Single(await db.Warehouses.ToListAsync()); Assert.Equal(13, await db.StorageLocations.CountAsync()); Assert.Single(await db.WarehouseSaveReceipts.ToListAsync());
        Assert.Equal(1, await db.WarehouseChanges.CountAsync(x => x.Action == "WarehouseCreated"));
        req.Warehouse.Name = "changed"; Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/workspace", req)).StatusCode);
    }
    [Fact]
    public async Task BasicOnlyAndInactiveWarehouseNeedNoPlanAndCustomCodeValidationIsPreserved()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var req = Draft(false); req.Warehouse.IsActive = false;
        var result = await Save(c, t.Root + "/workspace", req); Assert.Null((await Edit(c, t.Root + "/" + result.WarehouseId)).Plan);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, t.Root + "/workspace", Draft(false))).StatusCode);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Single(await db.Warehouses.ToListAsync()); Assert.Empty(await db.WarehousePlans.ToListAsync()); Assert.Empty(await db.StorageLocations.ToListAsync());
    }
    [Fact]
    public async Task NewInactiveAggregateRetainsRequestedStatusWithoutActivatingExistingWarehouses()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var req = Draft();
        req.Warehouse.IsActive = false; req.Zones[0].IsActive = false;
        var result = await Save(c, t.Root + "/workspace", req); var url = t.Root + "/" + result.WarehouseId;
        var edit = await Edit(c, url); Assert.False(edit.Warehouse.IsActive); Assert.False(edit.Zones[0].IsActive);
        Assert.Equal(13, (await c.GetFromJsonAsync<JsonElement>(url)).GetProperty("locationCount").GetInt32());
        edit.Racks[0].Levels = 4; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url + "/workspace", edit)).StatusCode);
        Assert.Equal(13, (await c.GetFromJsonAsync<JsonElement>(url)).GetProperty("locationCount").GetInt32());
    }
    [Theory]
    [InlineData("plan")][InlineData("duplicateFloor")][InlineData("foreignZone")][InlineData("duplicateRackLink")][InlineData("audit")][InlineData("receipt")]
    public async Task AnyLateFailureRollsBackWarehouseStructureLocationsPlanAuditAndReceipt(string failure)
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var req = Draft();
        if (failure == "plan") req.Plan!.Version = Guid.NewGuid();
        if (failure == "duplicateFloor") req.FloorLocations[0].Code = "R-L01-B01";
        if (failure == "foreignZone") req.Racks[0].ZoneClientId = Guid.NewGuid();
        if (failure == "duplicateRackLink") req.Plan!.Objects.Add(Object("rack", rack: req.Racks[0].ClientId));
        if (failure is "audit" or "receipt")
        {
            using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            await db.Database.ExecuteSqlRawAsync(failure == "audit" ? "CREATE TRIGGER fail_audit BEFORE INSERT ON WarehouseChanges WHEN NEW.Action = 'PlanSaved' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;" : "CREATE TRIGGER fail_receipt BEFORE INSERT ON WarehouseSaveReceipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END;");
        }
        var response = await AuthTests.Post(c, t.Root + "/workspace", req); Assert.False(response.IsSuccessStatusCode);
        using var verify = f.Services.CreateScope(); var final = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await final.Warehouses.ToListAsync()); Assert.Empty(await final.WarehouseZones.ToListAsync()); Assert.Empty(await final.WarehouseRacks.ToListAsync()); Assert.Empty(await final.StorageLocations.ToListAsync()); Assert.Empty(await final.WarehousePlans.ToListAsync()); Assert.Empty(await final.WarehousePlanObjects.ToListAsync()); Assert.Empty(await final.WarehouseChanges.ToListAsync()); Assert.Empty(await final.WarehouseSaveReceipts.ToListAsync());
        if (failure is not ("audit" or "receipt")) { var fixedRequest = Draft(); fixedRequest.RequestId = req.RequestId; Assert.Equal("WH-0001", (await Save(c, t.Root + "/workspace", fixedRequest)).Code); }
    }
    [Fact]
    public async Task EditingGeometryAndExpansionPreserveExistingSlotIdsCodesStateAndOmittedStructure()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var result = await Save(c, t.Root + "/workspace", Draft()); var url = t.Root + "/" + result.WarehouseId;
        Guid customId;
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var slot = await db.StorageLocations.FirstAsync(x => x.RackId != null); customId = slot.Id; slot.Code = "CUSTOM-SLOT"; slot.IsActive = false; await db.SaveChangesAsync(); }
        var ids = (await c.GetFromJsonAsync<JsonElement>(url + "/locations")).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("location").GetProperty("id").GetGuid()).Order().ToArray();
        var edit = await Edit(c, url); edit.Plan!.Objects[1].X = .7; edit.Racks[0].Levels = 4;
        var saved = await Save(c, url + "/workspace", edit, HttpStatusCode.OK); Assert.Equal(4, saved.RackLocations.Count);
        Assert.Equal(saved.WarehouseId, (await Save(c, url + "/workspace", edit, HttpStatusCode.OK)).WarehouseId);
        var clear = await Edit(c, url); clear.Plan!.Objects.Clear(); clear.Racks.Clear(); clear.Zones.Clear(); clear.FloorLocations.Clear();
        await Save(c, url + "/workspace", clear, HttpStatusCode.OK);
        using var verify = f.Services.CreateScope(); var final = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(17, await final.StorageLocations.CountAsync()); Assert.Single(await final.WarehouseRacks.ToListAsync()); Assert.Single(await final.WarehouseZones.ToListAsync());
        Assert.All(ids, id => Assert.True(final.StorageLocations.Any(x => x.Id == id)));
        var slotAfter = await final.StorageLocations.SingleAsync(x => x.Id == customId); Assert.Equal("CUSTOM-SLOT", slotAfter.Code); Assert.False(slotAfter.IsActive);
        Assert.Empty(await final.WarehousePlanObjects.ToListAsync());
    }
    [Theory]
    [InlineData("shrink")][InlineData("planVersion")][InlineData("rackVersion")][InlineData("zoneVersion")][InlineData("warehouseVersion")][InlineData("moveZone")][InlineData("foreignId")]
    public async Task FailedEditPreservesAllExistingDataAndVersions(string failure)
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c, t); var result = await Save(c, t.Root + "/workspace", Draft()); var url = t.Root + "/" + result.WarehouseId;
        var edit = await Edit(c, url); var before = JsonSerializer.Serialize(edit); edit.Warehouse.Name = "변경 시도";
        switch (failure) { case "shrink": edit.Racks[0].Levels = 2; break; case "planVersion": edit.Plan!.Version = Guid.NewGuid(); break; case "rackVersion": edit.Racks[0].Version = Guid.NewGuid(); break; case "zoneVersion": edit.Zones[0].Version = Guid.NewGuid(); break; case "warehouseVersion": edit.Warehouse.Version = Guid.NewGuid(); break; case "moveZone": edit.Racks[0].ZoneClientId = null; break; case "foreignId": edit.Racks[0].Id = edit.Racks[0].ClientId = Guid.NewGuid(); break; }
        Assert.False((await AuthTests.Post(c, url + "/workspace", edit)).IsSuccessStatusCode);
        var after = await Edit(c, url); after.RequestId = edit.RequestId; Assert.Equal(before, JsonSerializer.Serialize(after));
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(13, await db.StorageLocations.CountAsync()); Assert.Single(await db.WarehouseSaveReceipts.ToListAsync());
    }
    [Fact]
    public async Task TenantPermissionsCsrfAndCreateVersusUpdateAreEnforced()
    {
        using var f = new AuthFactory(); using var master = f.Client(); using var admin = f.Client(); using var employee = f.Client(); var t = await Seed(f); await Login(master, t); await Login(admin, t, "Administrator"); await Login(employee, t, "Employee");
        var draft = Draft(); Assert.Equal(HttpStatusCode.BadRequest, (await master.PostAsJsonAsync(t.Root + "/workspace", draft)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, t.Root + "/workspace", draft)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(master, $"/api/tenants/{t.Foreign}/warehouses/workspace", draft)).StatusCode);
        async Task Grants(params string[] grants) { var p = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/permissions"); var roles = p.GetProperty("roles").Deserialize<Dictionary<string, Dictionary<string, string[]>>>()!; roles["Administrator"]["warehouses"] = grants; Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, $"/api/tenants/{t.Tenant}/permissions", new { version = p.GetProperty("version").GetGuid(), roles })).StatusCode); }
        await Grants("menu", "read", "create"); var result = await Save(admin, t.Root + "/workspace", draft); var url = t.Root + "/" + result.WarehouseId;
        var edit = await Edit(admin, url); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, url + "/workspace", edit)).StatusCode);
        await Grants("menu", "read", "update"); edit.Plan!.Objects[0].X = .8; await Save(admin, url + "/workspace", edit, HttpStatusCode.OK);
        edit = await Edit(admin, url); edit.Zones.Add(new() { ClientId = Guid.NewGuid(), Code = "NEW", Name = "새 구역" });
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, url + "/workspace", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, t.Root + "/workspace", Draft(false))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await master.GetAsync($"/api/tenants/{t.Foreign}/warehouses/{result.WarehouseId}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await master.GetAsync(t.Root + "/" + Guid.NewGuid() + "/workspace")).StatusCode);
    }
}
