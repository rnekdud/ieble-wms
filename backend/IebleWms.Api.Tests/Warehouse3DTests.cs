using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class Warehouse3DTests
{
    [Fact]
    public async Task SavedPlanAndRealRackLocationsReuseStockOverviewWithoutMutation()
    {
        using var f=new AuthFactory();using var c=f.Client();
        var password="Test1!"+Guid.NewGuid().ToString("N");
        await AuthTests.Post(c,"/api/auth/register",new{companyName="3D QA",businessRegistrationNumber="1234512345",contactName="QA",contactPhone="010-1234-5678",email="scene@qa.test",password});
        await AuthTests.Post(c,"/api/auth/login",new{email="scene@qa.test",password});
        var me=await c.GetFromJsonAsync<JsonElement>("/api/auth/me");
        await Warehouse3DScenario.Run(c,"/api/tenants/"+me.GetProperty("selectedTenantId").GetGuid());
    }
    [Fact]
    public async Task WarehousePermissionDoesNotGrantStockAndForeignReferencesAreRejected()
    {
        using var f=new AuthFactory();using var c=f.Client();Guid tenant,rack,warehouse,location,other;var password="Test1!"+Guid.NewGuid().ToString("N");
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var t=new Tenant{Code="SCENE",Name="Scene",BillingStatus=TenantBillingStatus.Paid};var foreign=new Tenant{Code="FOREIGN",Name="Foreign"};var u=new ApplicationUser{UserName="viewer",Email="viewer@qa.test",DisplayName="Viewer"};Assert.True((await users.CreateAsync(u,password)).Succeeded);
            var w=new Warehouse{TenantId=t.Id,Code="W1",Name="W1"};var r=new WarehouseRack{TenantId=t.Id,WarehouseId=w.Id,Code="R1",Name="R1",Levels=1,Bays=1};var l=new StorageLocation{TenantId=t.Id,WarehouseId=w.Id,RackId=r.Id,Code="L1",Name="L1",Level=1,Bay=1};
            var grants=PermissionCatalog.Defaults();grants["Employee"]["stock-overview"]=[];
            db.AddRange(t,foreign,w,r,l,new TenantMembership{Tenant=t,User=u,Role=TenantRole.Employee},new TenantPermissionSettings{TenantId=t.Id,RolesJson=JsonSerializer.Serialize(grants),UpdatedByUserId=u.Id});await db.SaveChangesAsync();tenant=t.Id;warehouse=w.Id;rack=r.Id;location=l.Id;other=foreign.Id;
        }
        await AuthTests.Post(c,"/api/auth/login",new{email="viewer",password});var root=$"/api/tenants/{tenant}/warehouses/{warehouse}/racks/{rack}";
        var front=await c.GetFromJsonAsync<JsonElement>(root+"/front");Assert.False(front.GetProperty("inventoryAvailable").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/stock")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{other}/warehouses/{warehouse}/racks/{rack}/front")).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=await db.TenantPermissionSettings.SingleAsync();var grants=PermissionCatalog.Defaults();p.RolesJson=JsonSerializer.Serialize(grants);await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(root+"/stock?locationId="+location)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/stock?locationId="+Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{tenant}/warehouses/{Guid.NewGuid()}/racks/{rack}/stock")).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=await db.TenantPermissionSettings.SingleAsync();var grants=PermissionCatalog.Defaults();grants["Employee"]["warehouses"]=[];p.RolesJson=JsonSerializer.Serialize(grants);await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/front")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/stock")).StatusCode);
    }
}
public static class Warehouse3DScenario
{
    public static async Task Run(HttpClient c,string root)
    {
        static Guid Id(JsonElement x)=>x.GetProperty("id").GetGuid();static Guid Version(JsonElement x)=>x.GetProperty("version").GetGuid();
        async Task<JsonElement> Get(string url){var r=await c.GetAsync(url);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
        async Task<JsonElement> Post(string url,object body){var r=await AuthTests.Post(c,url,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
        var suffix=Guid.NewGuid().ToString("N")[..8];
        var warehouse=await Post(root+"/warehouses",new{name="3D Warehouse"});var wroot=root+"/warehouses/"+Id(warehouse);
        var zone=await Post(wroot+"/zones",new{code="Z1",name="Zone"});
        var rack=await Post(wroot+"/racks",new{code="R1",name="Rack",levels=3,bays=4,zoneId=Id(zone),barcode=new{mode="manual",value="QA-3D-"+suffix}});
        var rroot=wroot+"/racks/"+Id(rack);var front=await Get(rroot+"/front");Assert.True(front.GetProperty("inventoryAvailable").GetBoolean());Assert.Equal("3D Warehouse",front.GetProperty("warehouseName").GetString());Assert.Equal("Zone",front.GetProperty("zoneName").GetString());
        var locations=front.GetProperty("locations").EnumerateArray().Select(x=>x.GetProperty("location")).ToArray();Assert.Equal(12,locations.Length);var lid=Id(locations[0]);
        Assert.Equal(0,(await Get(rroot+"/stock?locationId="+lid)).GetProperty("total").GetInt32());
        var product=await Post(root+"/products",new{requestId=Guid.NewGuid(),code="3D-"+suffix,name="실제 재고",unit="EA",lotManaged=true,expiryManaged=true});
        await Post(root+"/inventory/adjust",new{requestId=Guid.NewGuid(),productId=Id(product),warehouseId=Id(warehouse),locationId=lid,quantity=10,lotNumber="LOT-3D",expiryDate=new DateOnly(2027,1,1),increase=true,occurredAt=DateTimeOffset.UtcNow,reason="Isolated QA"});
        var partner=(await Post(root+"/partners",new{requestId=Guid.NewGuid(),code="3D-"+suffix,name="QA",type="BOTH"})).GetProperty("partner");
        await Post(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate=DateOnly.FromDateTime(DateTime.UtcNow),expectedDate=DateOnly.FromDateTime(DateTime.UtcNow),partnerId=Id(partner),warehouseId=Id(warehouse),contactName="QA",lines=new[]{new{productId=Id(product),requestedQuantity=3}}});
        var before=(await Get(root+"/inventory?productId="+Id(product))).ToString();
        var stock=await Get(rroot+"/stock?locationId="+lid);var row=Assert.Single(stock.GetProperty("items").EnumerateArray());Assert.Equal(lid,row.GetProperty("locationId").GetGuid());Assert.Equal(10,row.GetProperty("quantity").GetDecimal());Assert.Equal(3,row.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(7,row.GetProperty("availableQuantity").GetDecimal());Assert.Equal("LOT-3D",row.GetProperty("lotNumber").GetString());
        var report=await Get(root+$"/reports/stock-overview?view=location&warehouseId={Id(warehouse)}&rackId={Id(rack)}&locationId={lid}");Assert.Equal(report.GetProperty("items").ToString(),stock.GetProperty("items").ToString());
        var objectId=Guid.NewGuid();object Plan(Guid version,double x,int angle)=>new{version,schemaVersion=1,aspectRatio=1.5,objects=new[]{new{id=objectId,type="rack",label="Rack",x,y=.5,width=.2,height=.1,rotation=angle,fill="#a7ccdf",shape="rectangle",rackId=Id(rack)}}};
        var saved=await Post(wroot+"/plan",Plan(Guid.Empty,.2,0));await Post(wroot+"/plan",Plan(Version(saved),.7,90));var loaded=await Get(wroot+"/plan");Assert.Equal(.7,loaded.GetProperty("objects")[0].GetProperty("x").GetDouble());Assert.Equal(90,loaded.GetProperty("objects")[0].GetProperty("rotation").GetInt32());
        front=await Get(rroot+"/front");Assert.Equal(locations.Select(Id),front.GetProperty("locations").EnumerateArray().Select(x=>Id(x.GetProperty("location"))));Assert.Equal(rack.GetProperty("barcode").GetString(),front.GetProperty("rack").GetProperty("barcode").GetString());Assert.Equal(before,(await Get(root+"/inventory?productId="+Id(product))).ToString());
        await Post(wroot+"/racks/"+Id(rack),new{version=Version(front.GetProperty("rack")),name="Rack",code="R1",levels=4,bays=4,zoneId=Id(zone),barcode=new{mode="keep"}});
        front=await Get(rroot+"/front");Assert.Equal(16,front.GetProperty("locations").GetArrayLength());foreach(var location in locations)Assert.Contains(front.GetProperty("locations").EnumerateArray(),x=>Id(x.GetProperty("location"))==Id(location));Assert.Equal(before,(await Get(root+"/inventory?productId="+Id(product))).ToString());
    }
}
