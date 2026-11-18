using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class WarehousePlanTests
{
    private static async Task<object> DeleteRequest(AuthFactory f, Fixture t, Guid version)
    {
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();
        var rack=await db.WarehouseRacks.SingleAsync(x=>x.Id==t.Rack);
        return new { planVersion=version, racks=new[]{new{id=rack.Id,version=rack.Version}} };
    }
    [Fact]
    public async Task ImmediateRackDeletionRemovesOwnedStructureAndPlanOnlyAndAdvancesVersion()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        Guid retainedRack;
        using(var seedScope=f.Services.CreateScope()) {
            var seedDb=seedScope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var other=new WarehouseRack{TenantId=t.Tenant,WarehouseId=t.OtherWarehouse,Code="KEEP",Name="보존 랙",Levels=1,Bays=1};retainedRack=other.Id;seedDb.Add(other);
            seedDb.Add(new StorageBarcode{TenantId=t.Tenant,WarehouseId=t.Warehouse,RackId=t.Rack,Value="RACK-DELETE-TEST"});
            await seedDb.SaveChangesAsync();
        }
        var keep=Object();var req=Request(Object(t.Rack,t.Location),keep);
        var saved=await AuthTests.Post(c,Root(t)+"/plan",req);Assert.Equal(HttpStatusCode.OK,saved.StatusCode);
        var version=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetGuid();
        var body=await DeleteRequest(f,t,version);
        var response=await AuthTests.Post(c,Root(t)+"/racks/delete",body);Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        var result=await response.Content.ReadFromJsonAsync<JsonElement>();Assert.NotEqual(version,result.GetProperty("planVersion").GetGuid());
        Assert.Equal(12,result.GetProperty("locationIds").GetArrayLength());
        var reread=await c.GetFromJsonAsync<JsonElement>(Root(t)+"/plan");Assert.Single(reread.GetProperty("objects").EnumerateArray());Assert.Equal(keep.Id,reread.GetProperty("objects")[0].GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,Root(t)+"/racks/delete",body)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/plan",req)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(retainedRack,(await db.WarehouseRacks.SingleAsync()).Id);Assert.Empty(await db.StorageLocations.ToListAsync());Assert.Empty(await db.StorageBarcodes.ToListAsync());Assert.Equal(2,await db.Warehouses.CountAsync());Assert.Equal(2,await db.Tenants.CountAsync());
        var audit=await db.WarehouseChanges.SingleAsync(x=>x.Action=="RackDeleted");Assert.NotEqual(Guid.Empty,audit.ChangedByUserId);Assert.Contains(t.Rack.ToString(),audit.BeforeJson);
    }
    [Theory]
    [InlineData("stock")][InlineData("zero-stock-history")][InlineData("receipt-rack")][InlineData("receipt-placement")][InlineData("shipment-rack")][InlineData("stocktake")][InlineData("stocktake-rack")]
    public async Task RackDeletionBlocksStockAndBusinessReferencesWithoutChangingAnything(string kind)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var product=new Product{TenantId=t.Tenant,Code="P1",NormalizedCode="P1",Name="제품"};db.Add(product);
            if(kind.StartsWith("stock")||kind=="zero-stock-history")db.Add(new StockBalance{TenantId=t.Tenant,WarehouseId=t.Warehouse,LocationId=t.Location,ProductId=product.Id,Quantity=kind=="stock"?1:0,SourceKey="fixture"});
            else if(kind.StartsWith("stocktake")) {
                var count=new Stocktake{TenantId=t.Tenant,WarehouseId=t.Warehouse,Number="CT1",Name="실사",Scope=kind=="stocktake-rack"?"Rack":"Warehouse",ScopeId=kind=="stocktake-rack"?t.Rack:null,BasisDate=new DateOnly(2026,11,10)};db.Add(count);
                if(kind=="stocktake")db.Add(new StocktakeTarget{TenantId=t.Tenant,StocktakeId=count.Id,ProductId=product.Id,WarehouseId=t.Warehouse,LocationId=t.Location});
            }
            else {
                var partner=new Partner{TenantId=t.Tenant,Code="PT1",NormalizedCode="PT1",Name="거래처"};db.Add(partner);
                if(kind=="shipment-rack") {
                    var shipment=new OutboundShipment{TenantId=t.Tenant,WarehouseId=t.Warehouse,PartnerId=partner.Id,Number="SH1",ExpectedDate=new DateOnly(2026,11,10),RequestDate=new DateOnly(2026,11,10)};db.Add(shipment);
                    db.Add(new OutboundShipmentLine{TenantId=t.Tenant,ShipmentId=shipment.Id,ProductId=product.Id,RequestedQuantity=1,PlannedRackId=t.Rack,PlannedRackWarehouseId=t.Warehouse});
                } else {
                var receipt=new InboundReceipt{TenantId=t.Tenant,WarehouseId=t.Warehouse,PartnerId=partner.Id,Number="RC1",ExpectedDate=new DateOnly(2026,11,10)};db.Add(receipt);
                db.Add(new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=receipt.Id,ProductId=product.Id,ExpectedQuantity=1,PlannedRackId=kind=="receipt-rack"?t.Rack:null,PlannedRackWarehouseId=kind=="receipt-rack"?t.Warehouse:null,PlacementsJson=kind=="receipt-placement"?JsonSerializer.Serialize(new[]{new ReceiptPlacement{LocationId=t.Location,Quantity=1}}):"[]"});
                }
            }
            await db.SaveChangesAsync();
        }
        var response=await AuthTests.Post(c,Root(t)+"/racks/delete",await DeleteRequest(f,t,Guid.Empty));Assert.Equal(HttpStatusCode.Conflict,response.StatusCode);
        using var verify=f.Services.CreateScope();var final=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await final.WarehouseRacks.ToListAsync());Assert.Equal(12,await final.StorageLocations.CountAsync());Assert.Empty(await final.WarehouseChanges.Where(x=>x.Action=="RackDeleted").ToListAsync());
    }
    [Fact]
    public async Task RackDeletionEnforcesPermissionTenantWarehouseVersionAndRollback()
    {
        using var f=new AuthFactory();using var c=f.Client();using var staff=f.Client();var t=await Seed(f);await Login(c,t);await Login(staff,t,"Employee");
        var body=await DeleteRequest(f,t,Guid.Empty);
        Assert.Equal(HttpStatusCode.BadRequest,(await c.PostAsJsonAsync(Root(t)+"/racks/delete",body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(staff,Root(t)+"/racks/delete",body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,$"/api/tenants/{t.Foreign}/warehouses/{t.Warehouse}/racks/delete",body)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,$"/api/tenants/{t.Tenant}/warehouses/{t.OtherWarehouse}/racks/delete",body)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/racks/delete",await DeleteRequest(f,t,Guid.NewGuid()))).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_rack_delete BEFORE INSERT ON WarehouseChanges WHEN NEW.Action = 'RackDeleted' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;");}
        Assert.Equal(HttpStatusCode.InternalServerError,(await AuthTests.Post(c,Root(t)+"/racks/delete",body)).StatusCode);
        using var verify=f.Services.CreateScope();var final=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await final.WarehouseRacks.ToListAsync());Assert.Equal(12,await final.StorageLocations.CountAsync());
    }
}
