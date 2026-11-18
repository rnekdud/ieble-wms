using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Shipping;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class ShipmentRouteTests
{
    static WarehousePlanObject Shape(string type,double x,double y,double w,double h,Guid? rack=null,double rotation=0)=>new(){Type=type,X=x,Y=y,Width=w,Height=h,RackId=rack,Rotation=rotation};
    [Fact] public void ConnectedAislesOrderRacksAndConsiderExistingPicks()
    {
        var a=Guid.NewGuid();var b=Guid.NewGuid();WarehousePlanObject[] plan=[Shape("door",.1,.5,.1,.2),Shape("aisle",.5,.5,.9,.2),Shape("rack",.3,.35,.1,.1,a),Shape("rack",.8,.35,.1,.1,b)];
        var order=ShipmentRouteOrder.Calculate(plan,1,[a,b],[]);Assert.Equal(2,order.Distances.Count);Assert.True(order.Distances[a]<order.Distances[b]);
        var next=ShipmentRouteOrder.Calculate(plan,1,[a,b],[b]);Assert.True(next.Distances[b]<next.Distances[a]);
    }
    [Fact] public void StoredGeometryUsesFreeFloorDespiteDisconnectedVisualAisles()
    {
        var ids=Enumerable.Range(0,6).Select(_=>Guid.NewGuid()).ToArray();
        // Read-only WH-0003 snapshot: aspect 1.6, no rotation; entrance aisle ends at .87,
        // central aisle ends at .55, rack faces at .38/.62. These are real gaps, not rounding.
        var entry=Shape("aisle",.5,.92,.12,.1);entry.Label="출입 통로";
        var central=Shape("aisle",.5,.5,.86,.1);central.Label="중앙 통로";
        var plan=new List<WarehousePlanObject>{Shape("door",.5,.95,.12,.025),entry,central,
            Shape("wall",.5,.05,.94,.016),Shape("wall",.24,.95,.4,.016),Shape("wall",.76,.95,.4,.016),Shape("wall",.04,.5,.01,.9),Shape("wall",.96,.5,.01,.9)};
        for(var i=0;i<6;i++){var rack=Shape("rack",new[]{.22,.5,.78}[i%3],i<3?.28:.72,.18,.2,ids[i]);rack.Label=$"R-0{i+1}";plan.Add(rack);}
        var result=ShipmentRouteOrder.Calculate(plan,1.6,ids,[]);
        Assert.Equal("connected",result.Status);Assert.Empty(result.DisconnectedAisles);Assert.Equal(6,result.Distances.Count);Assert.Empty(result.UnreachableRackIds);
    }
    [Fact] public void MissingEntranceStillFallsBackButAislesAreOptional()
    {
        var rack=Guid.NewGuid();Assert.Equal("missing_entrance",ShipmentRouteOrder.Calculate([],1,[rack],[]).Status);
        Assert.Equal("rack_geometry_missing",ShipmentRouteOrder.Calculate([Shape("door",.1,.1,.1,.1)],1,[rack],[]).Status);
        Assert.Equal("rack_geometry_missing",ShipmentRouteOrder.Calculate([Shape("door",.1,.1,.1,.1),Shape("aisle",.7,.7,.1,.1)],1,[rack],[]).Status);
    }
    [Theory][InlineData(0)][InlineData(20)] public void ThinOrRotatedWallsAreNeverCrossed(double rotation)
    {
        var a=Guid.NewGuid();var b=Guid.NewGuid();WarehousePlanObject[] plan=[Shape("door",.1,.5,.1,.2),Shape("aisle",.5,.5,.9,.2),Shape("rack",.3,.35,.1,.1,a),Shape("rack",.8,.35,.1,.1,b),Shape("wall",.55,.5,.001,1,null,rotation),Shape("wall",.5,.1,1,.01),Shape("wall",.5,.9,1,.01)];
        var order=ShipmentRouteOrder.Calculate(plan,1,[a,b],[]);Assert.Contains(a,order.Distances.Keys);Assert.DoesNotContain(b,order.Distances.Keys);
    }
    [Fact] public void OnlyMissingOrAmbiguousEntranceTriggersFallbackForSeparatedAisles()
    {
        var rack=Guid.NewGuid();WarehousePlanObject[] plan=[Shape("door",.1,.5,.1,.2),Shape("aisle",.2,.5,.3,.2),Shape("aisle",.7,.5,.69,.2),Shape("rack",.8,.35,.1,.1,rack)];
        var result=ShipmentRouteOrder.Calculate(plan,1,[rack],[]);Assert.Single(result.Distances);Assert.Equal("connected",result.Status);
        Assert.Empty(ShipmentRouteOrder.Calculate([..plan,Shape("door",.9,.5,.1,.1)],1,[rack],[]).Distances);
        Assert.Contains("출입구",ShipmentRouteOrder.Calculate([],1,[rack],[]).Notice);
    }
}
public sealed partial class ShipmentTests
{
    [Fact] public async Task ShipmentRackStockSelectionAndOwnReservations(){using var f=new AuthFactory();using var c=f.Client();await RackStockScenario(f,c);}
    [ScanPostgresFact] public async Task PostgresShipmentRackStockSelectionAndOwnReservations(){using var f=new ScanPostgresFactory();using var c=f.Client();await RackStockScenario(f,c);}
    static async Task RackStockScenario(WebApplicationFactory<Program> f,HttpClient c)
    {
        var api=await c.GetAsync("/openapi/v1.json");Assert.True(api.IsSuccessStatusCode,await api.Content.ReadAsStringAsync());
        var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var a=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="A",Name="가까운 랙",Levels=1,Bays=1};
        var b=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="B",Name="재고 많은 랙",Levels=1,Bays=1};
        var locA=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=a.Id,Code="A-1",Name="A",Level=1,Bay=1};
        var locB=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=b.Id,Code="B-1",Name="B",Level=1,Bay=1};
        Guid otherWarehouse;
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();otherWarehouse=(await db.Warehouses.SingleAsync(x=>x.TenantId==t.Other)).Id;
            db.AddRange(a,b,locA,locB,new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=locA.Id,ProductId=s.Bulk,Unit="kg",Quantity=10,LotNumber="L1",ExpiryDate=new DateOnly(2027,1,1),SourceKey="RACK-A"},new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=locB.Id,ProductId=s.Bulk,Unit="kg",Quantity=20,LotNumber="L2",ExpiryDate=new DateOnly(2027,2,1),SourceKey="RACK-B"},new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=locB.Id,ProductId=s.Serial,Unit="EA",Quantity=1,SerialNumber="ONLY-B",SourceKey="RACK-SERIAL"});
            (await db.Products.SingleAsync(x=>x.Id==s.Bulk)).RetailPrice=2500;await db.SaveChangesAsync();
        }
        var root=Root(t);async Task<JsonElement> Get(string query){var response=await c.GetAsync(root+"/choices?warehouseId="+s.Warehouse+"&"+query);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());return await response.Content.ReadFromJsonAsync<JsonElement>();}
        var products=await Get("kind=product-table&stockOnly=true");Assert.Equal(2,products.GetProperty("total").GetInt32());
        var filtered=await Get($"kind=product-table&stockOnly=true&rackId={a.Id}");var p=Assert.Single(filtered.GetProperty("items").EnumerateArray());Assert.Equal(s.Bulk,Id(p));Assert.Equal(10,p.GetProperty("physical").GetDecimal());Assert.Equal(2500,p.GetProperty("retailPrice").GetDecimal());
        Assert.Equal(0,(await Get($"kind=product-table&stockOnly=true&rackId={a.Id}&ids={s.Serial}")).GetProperty("total").GetInt32());
        var racks=await Get($"kind=racks&productId={s.Bulk}&sort=stock");Assert.Equal(b.Id,Id(racks.GetProperty("recommendedRack")));Assert.Equal(b.Id,Id(racks.GetProperty("items")[0]));Assert.Equal(20,racks.GetProperty("items")[0].GetProperty("rackAvailable").GetDecimal());
        var noRoute=await Get($"kind=racks&productId={s.Bulk}&sort=route");Assert.Equal(JsonValueKind.Null,noRoute.GetProperty("recommendedRack").ValueKind);Assert.Equal("missing_entrance",noRoute.GetProperty("routeStatus").GetString());
        var lot=await Get($"kind=racks&productId={s.Bulk}&sort=stock&lotNumber=L1");Assert.Equal(a.Id,Id(lot.GetProperty("items")[0]));Assert.Equal(0,lot.GetProperty("items")[1].GetProperty("rackAvailable").GetDecimal());
        var expiry=await Get($"kind=racks&productId={s.Bulk}&sort=stock&expiryDate=2027-01-01");Assert.Equal(a.Id,Id(expiry.GetProperty("items")[0]));Assert.Equal(0,expiry.GetProperty("items")[1].GetProperty("rackAvailable").GetDecimal());
        var serial=await Get($"kind=racks&productId={s.Serial}&sort=stock&serials=ONLY-B");Assert.Equal(b.Id,Id(serial.GetProperty("items")[0]));Assert.Equal(1,serial.GetProperty("items")[0].GetProperty("rackAvailable").GetDecimal());
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(root+$"/choices?kind=racks&warehouseId={otherWarehouse}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Other}/shipments/choices?kind=racks&warehouseId={otherWarehouse}")).StatusCode);
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new WarehousePlan{TenantId=t.Tenant,WarehouseId=s.Warehouse,AspectRatio=1,CreatedByUserId=t.Actor,UpdatedByUserId=t.Actor});
            WarehousePlanObject Object(string type,double x,double y,double w,double h,Guid? rack=null)=>new(){Id=Guid.NewGuid(),TenantId=t.Tenant,WarehouseId=s.Warehouse,Type=type,X=x,Y=y,Width=w,Height=h,RackId=rack};
            db.AddRange(Object("door",.1,.5,.1,.2),Object("aisle",.5,.5,.9,.2),Object("rack",.3,.35,.1,.1,a.Id),Object("rack",.8,.35,.1,.1,b.Id));await db.SaveChangesAsync();
        }
        var near=await Get($"kind=racks&productId={s.Bulk}&sort=route&quantity=5");Assert.Equal(a.Id,Id(near.GetProperty("recommendedRack")));Assert.Equal("connected",near.GetProperty("routeStatus").GetString());
        var enough=await Get($"kind=racks&productId={s.Bulk}&sort=route&quantity=12");Assert.Equal(b.Id,Id(enough.GetProperty("recommendedRack")));
        var next=await Get($"kind=racks&productId={s.Bulk}&sort=route&quantity=5&selectedRackIds={b.Id}");Assert.Equal(b.Id,Id(next.GetProperty("recommendedRack")));
        // Route recommendation must not depend on optional aisle objects, and inaccessible
        // stock must remain excluded while stock sorting and tenant checks stay unchanged.
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.WarehousePlanObjects.RemoveRange(await db.WarehousePlanObjects.Where(x=>x.TenantId==t.Tenant&&x.WarehouseId==s.Warehouse&&x.Type=="aisle").ToListAsync());
            await db.SaveChangesAsync();
        }
        var noAisles=await Get($"kind=racks&productId={s.Bulk}&sort=route&quantity=12");
        Assert.Equal("connected",noAisles.GetProperty("routeStatus").GetString());Assert.Equal(b.Id,Id(noAisles.GetProperty("recommendedRack")));
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new WarehousePlanObject{Id=Guid.NewGuid(),TenantId=t.Tenant,WarehouseId=s.Warehouse,Type="wall",X=.55,Y=.5,Width=.005,Height=1});
            await db.SaveChangesAsync();
        }
        var blocked=await Get($"kind=racks&productId={s.Bulk}&sort=route&quantity=12");
        Assert.Equal("partial",blocked.GetProperty("routeStatus").GetString());Assert.Equal(a.Id,Id(blocked.GetProperty("recommendedRack")));
        Assert.Equal(JsonValueKind.Null,blocked.GetProperty("items").EnumerateArray().Single(x=>Id(x)==b.Id).GetProperty("routeDistance").ValueKind);
        Assert.Equal(b.Id,Id((await Get($"kind=racks&productId={s.Bulk}&sort=stock")).GetProperty("recommendedRack")));
        var request=OutRequest(s,8);request.Lines[0].PlannedRackId=a.Id;var doc=await Post(c,root,request);var id=Id(Shipment(doc));
        var own=await Get($"kind=racks&productId={s.Bulk}&shipmentId={id}&rackId={a.Id}");Assert.Equal(JsonValueKind.Null,own.GetProperty("recommendedRack").ValueKind);var ownRack=Assert.Single(own.GetProperty("items").EnumerateArray());Assert.Equal(2,ownRack.GetProperty("rackAvailable").GetDecimal());Assert.Equal(8,ownRack.GetProperty("ownReserved").GetDecimal());Assert.Equal(10,ownRack.GetProperty("rackRequestable").GetDecimal());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(31,(await db.StockBalances.Where(x=>x.TenantId==t.Tenant).ToListAsync()).Sum(x=>x.Quantity));Assert.Empty(await db.StockMovements.Where(x=>x.TenantId==t.Tenant).ToListAsync());}
    }
}
