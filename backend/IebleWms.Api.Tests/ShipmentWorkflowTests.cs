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
public sealed partial class ShipmentTests
{
    [Fact] public async Task PlannedShipmentRacksAndActualSplitHistory(){using var f=new AuthFactory();using var c=f.Client();await PlannedShipmentScenario(f,c);}
    [ScanPostgresFact] public async Task PostgresPlannedShipmentRacksAndActualSplitHistory(){using var f=new ScanPostgresFactory();using var c=f.Client();await PlannedShipmentScenario(f,c);}
    static async Task PlannedShipmentScenario(WebApplicationFactory<Program> f,HttpClient c)
    {
        var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var planned=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="Z-PLAN",Name="예정 랙",Levels=1,Bays=1};
        var other=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="A-OTHER",Name="다른 랙",Levels=1,Bays=1};
        var empty=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="0-EMPTY",Name="빈 랙",Levels=1,Bays=1};
        var first=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=planned.Id,Code="Z-1",Name="1단 1칸",Level=1,Bay=1};
        var second=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=other.Id,Code="A-1",Name="1단 1칸",Level=1,Bay=1};
        var a=new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=first.Id,ProductId=s.Serial,Unit="EA",Quantity=5,LotNumber="SPLIT",SourceKey="QA-Z"};
        var b=new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=second.Id,ProductId=s.Serial,Unit="EA",Quantity=8,LotNumber="SPLIT",SourceKey="QA-A"};
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.AddRange(planned,other,empty,first,second,a,b,new StorageBarcode{TenantId=t.Tenant,ProductId=s.Serial,Value="SPLIT-PRODUCT"},new StorageBarcode{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=first.Id,Value="SPLIT-LOCATION"});
            (await db.Products.SingleAsync(p=>p.Id==s.Serial)).RetailPrice=5000;await db.SaveChangesAsync();
        }
        var root=Root(t);
        var choices=await c.GetFromJsonAsync<JsonElement>($"{root}/choices?kind=racks&warehouseId={s.Warehouse}&productId={s.Serial}");
        Assert.Equal(3,choices.GetProperty("total").GetInt32());Assert.Equal(empty.Id,choices.GetProperty("items")[0].GetProperty("id").GetGuid());Assert.Contains("랙 코드 순",choices.GetProperty("routeNotice").GetString());
        foreach(var term in new[]{"예정 랙","Z-PLAN"})Assert.Equal(planned.Id,(await c.GetFromJsonAsync<JsonElement>($"{root}/choices?kind=racks&warehouseId={s.Warehouse}&search={Uri.EscapeDataString(term)}")).GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync($"{root}/choices?kind=racks&warehouseId={Guid.NewGuid()}")).StatusCode);
        var request=OutRequest(s,10,true);Assert.DoesNotContain("PlannedRackId",JsonSerializer.Serialize(request));request.Lines[0].PlannedRackId=Guid.NewGuid();Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root,request)).StatusCode);
        request.Lines[0].PlannedRackId=planned.Id;var d=await Post(c,root,request);var id=Id(Shipment(d));var url=root+"/"+id;
        Assert.Equal(planned.Id,Line(d).GetProperty("plannedRackId").GetGuid());Assert.Equal(5000,Line(d).GetProperty("retailPrice").GetDecimal());Assert.Equal("예정 랙",Line(d).GetProperty("plannedRackName").GetString());
        Assert.Equal(id,Id(Shipment(await Post(c,root,request))));
        var allocations=d.GetProperty("allocations").EnumerateArray().ToArray();Assert.Equal(2,allocations.Length);Assert.All(allocations,x=>Assert.Equal(5,x.GetProperty("quantity").GetDecimal()));
        Assert.Contains(allocations,x=>x.GetProperty("locationId").GetGuid()==first.Id);Assert.Contains(allocations,x=>x.GetProperty("locationId").GetGuid()==second.Id);Assert.All(allocations,x=>Assert.Equal(0,x.GetProperty("pickedQuantity").GetDecimal()));
        async Task VerifyStock(decimal q,decimal reserved){using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stocks=await db.StockBalances.Where(x=>x.TenantId==t.Tenant).ToListAsync();Assert.Equal(q,stocks.Sum(x=>x.Quantity));Assert.Equal(reserved,stocks.Sum(x=>x.ReservedQuantity));}
        await VerifyStock(13,10);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/confirm",new{version=Version(Shipment(d))})).StatusCode);
        d=await Action(c,t,d,"start-picking");
        var label=await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="SPLIT-LOCATION"},HttpStatusCode.OK);Assert.Equal(first.Id,label.GetProperty("locationId").GetGuid());
        var scan=new{requestId=Guid.NewGuid(),barcode="SPLIT-PRODUCT",locationId=first.Id};await Post(c,url+"/scan-picking",scan,HttpStatusCode.OK);var replay=await Post(c,url+"/scan-picking",scan,HttpStatusCode.OK);Assert.True(replay.GetProperty("replayed").GetBoolean());d=replay.GetProperty("detail");
        d=await Work(c,t,d,"picking");Assert.Equal("Picked",Shipment(d).GetProperty("status").GetString());await VerifyStock(13,10);
        d=await Work(c,t,d,"inspection",false,2);await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="SPLIT-PRODUCT",locationId=first.Id},HttpStatusCode.OK);d=await c.GetFromJsonAsync<JsonElement>(url);
        Assert.Equal(3,d.GetProperty("allocations").EnumerateArray().Single(x=>x.GetProperty("locationId").GetGuid()==first.Id).GetProperty("inspectedQuantity").GetDecimal());
        d=await Work(c,t,d,"inspection");Assert.Equal("Inspected",Shipment(d).GetProperty("status").GetString());await VerifyStock(13,10);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="SPLIT-PRODUCT",locationId=first.Id})).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/inspection",WorkBody(d,false,1))).StatusCode);
        d=await Action(c,t,d,"confirm");await Action(c,t,d,"confirm");await VerifyStock(3,0);
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.StockMovements.CountAsync(x=>x.ShipmentId==id));Assert.Equal(1,await db.ShipmentChanges.CountAsync(x=>x.ShipmentId==id&&x.Action=="Confirmed"));
            (await db.WarehouseRacks.SingleAsync(x=>x.Id==planned.Id)).Code="RENAMED";
            (await db.StockBalances.SingleAsync(x=>x.Id==a.Id)).LocationId=s.Location;await db.SaveChangesAsync();
        }
        d=await c.GetFromJsonAsync<JsonElement>(url);allocations=d.GetProperty("allocations").EnumerateArray().ToArray();Assert.Contains(allocations,x=>x.GetProperty("locationId").GetGuid()==first.Id&&x.GetProperty("rackId").GetGuid()==planned.Id);Assert.Equal(10,allocations.Sum(x=>x.GetProperty("confirmedQuantity").GetDecimal()));Assert.Contains(allocations,x=>x.GetProperty("rackCode").GetString()=="Z-PLAN");Assert.All(allocations,x=>{Assert.Equal(s.Warehouse,x.GetProperty("warehouseId").GetGuid());Assert.Equal("Master",x.GetProperty("pickedByName").GetString());Assert.NotEqual(JsonValueKind.Null,x.GetProperty("pickedAt").ValueKind);});
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/confirm",new{version=Version(Shipment(d))})).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url)).StatusCode);
    }
}
