using System.Diagnostics;
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
public sealed class WarehouseStructureBrowserFactAttribute : FactAttribute
{
    public WarehouseStructureBrowserFactAttribute() { if (Environment.GetEnvironmentVariable("WMS_STRUCTURE_BROWSER") != "1") Skip = "Opt in with isolated SQLite API 5086 and frontend 5176."; }
}
public sealed partial class WarehouseWorkspaceTests
{
    private static async Task<(Guid Warehouse, Guid Rack, Guid Location)> ReadStructureFixture(AuthFactory f, HttpClient c, Fixture t)
    {
        var draft = Draft();
        draft.Plan!.Objects[0].X = .45; draft.Plan.Objects[0].Y = .45; draft.Plan.Objects[0].Width = .7; draft.Plan.Objects[0].Height = .65;
        draft.Plan.Objects[1].X = .3; draft.Plan.Objects[1].Y = .4;
        draft.Plan.Objects[2].X = .65; draft.Plan.Objects[2].Y = .6; draft.Plan.Objects[2].Width = .12; draft.Plan.Objects[2].Height = .12;
        draft.Zones[0].Name = "A구역"; draft.Racks[0].Name = "주 랙";
        draft.Zones.Add(new() { ClientId = Guid.NewGuid(), Name = "B구역", Code = "B" });
        draft.Racks.Add(new() { ClientId = Guid.NewGuid(), Name = "미배치 랙", Code = "UNPLACED", Levels = 1, Bays = 2, ZoneClientId = draft.Zones[0].ClientId });
        draft.Racks.Add(new() { ClientId = Guid.NewGuid(), Name = "구역 없는 랙", Code = "NO-ZONE", Levels = 1, Bays = 1 });
        var saved = await Save(c, t.Root + "/workspace", draft);
        var rack = saved.Racks[draft.Racks[0].ClientId];
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.True(db.Database.IsSqlite());
        var location = await db.StorageLocations.SingleAsync(l => l.RackId == rack && l.Level == 1 && l.Bay == 1);
        var product = new Product { TenantId = t.Tenant, Name = "구조 QA 재고", Code = "STRUCTURE", NormalizedCode = "STRUCTURE" };
        db.Products.Add(product);
        db.StockBalances.Add(new() { TenantId = t.Tenant, WarehouseId = saved.WarehouseId, LocationId = location.Id, ProductId = product.Id, Quantity = 42.5m, ReservedQuantity = 2, SourceKey = "STRUCTURE-QA" });
        await db.SaveChangesAsync();
        return (saved.WarehouseId, rack, location.Id);
    }
    private static async Task ReadOnlyGrants(HttpClient c, Fixture t)
    {
        var p = await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/permissions");
        var roles = p.GetProperty("roles").Deserialize<Dictionary<string, Dictionary<string, string[]>>>()!;
        roles["Administrator"]["warehouses"] = ["menu", "read"];
        roles["Administrator"]["stock-overview"] = [];
        roles["Employee"]["warehouses"] = [];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, $"/api/tenants/{t.Tenant}/permissions", new { version = p.GetProperty("version").GetGuid(), roles })).StatusCode);
    }
    [Fact] public async Task StructureReadSearchCountsStockAndPermissionsPreserveStoredRelationships()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); await Login(c,t);
        var ids = await ReadStructureFixture(f,c,t); var url = t.Root+"/"+ids.Warehouse;
        var detail = await c.GetFromJsonAsync<JsonElement>(url);
        Assert.Equal(16,detail.GetProperty("locationCount").GetInt32()); Assert.Equal(12,detail.GetProperty("rackLocationCounts").GetProperty(ids.Rack.ToString()).GetInt32());
        foreach(var (search,total) in new[]{("A구역",15),("주 랙",12),("UNPLACED",2),("R-L01-B01",1)}) {
            var rows = await c.GetFromJsonAsync<JsonElement>(url+"/locations?search="+Uri.EscapeDataString(search));
            Assert.Equal(total,rows.GetProperty("total").GetInt32());Assert.Equal(50,rows.GetProperty("pageSize").GetInt32());
        }
        var result=await c.GetFromJsonAsync<JsonElement>(url+"/locations?rackId="+ids.Rack);
        Assert.True(result.GetProperty("inventoryAvailable").GetBoolean());
        var occupied=result.GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("location").GetProperty("id").GetGuid()==ids.Location);
        Assert.Equal(42.5m,occupied.GetProperty("quantities")[0].GetProperty("quantity").GetDecimal());
        await ReadOnlyGrants(c,t);await Login(c,t,"Administrator");
        result=await c.GetFromJsonAsync<JsonElement>(url+"/locations");Assert.False(result.GetProperty("inventoryAvailable").GetBoolean());Assert.All(result.GetProperty("items").EnumerateArray(),x=>Assert.Equal(JsonValueKind.Null,x.GetProperty("quantities").ValueKind));
        await Login(c,t,"Employee");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url+"/locations")).StatusCode);
        await Login(c,t);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Foreign}/warehouses/{ids.Warehouse}/locations")).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(16,await db.StorageLocations.CountAsync());Assert.Equal(42.5m,(await db.StockBalances.SingleAsync()).Quantity);
    }
    [WarehouseStructureBrowserFact] public async Task StructureReadOnlyRealBrowserAndPlanSaveUseIsolatedSqlite()
    {
        using var f=new AuthFactory();f.UseKestrel(5086);using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
        var t=await Seed(f);await Login(c,t);var ids=await ReadStructureFixture(f,c,t);await ReadOnlyGrants(c,t);
        var info=new ProcessStartInfo("node","tests/warehouse-structure-readonly.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_STRUCTURE_UI_ORIGIN")??"http://127.0.0.1:5176";
        using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,warehouse=ids.Warehouse,rack=ids.Rack,location=ids.Location}));process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
        Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
        using var final=f.Services.CreateScope();var dbFinal=final.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal("도면 저장 랙",(await dbFinal.WarehouseRacks.SingleAsync(r => r.TenantId == t.Tenant && r.WarehouseId == ids.Warehouse && r.Id == ids.Rack))!.Name);Assert.NotNull(await dbFinal.StorageLocations.SingleAsync(l => l.TenantId == t.Tenant && l.WarehouseId == ids.Warehouse && l.Id == ids.Location));Assert.Equal(42.5m,(await dbFinal.StockBalances.SingleAsync()).Quantity);
        Assert.Equal(3,await dbFinal.WarehouseRacks.CountAsync());Assert.Equal(20,await dbFinal.StorageLocations.CountAsync());
    }
}
