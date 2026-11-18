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
public sealed partial class ShipmentTests
{
    static async Task ScanLabels(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f, Fixture t, Structure s)
    {
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        db.AddRange(new StorageBarcode{TenantId=t.Tenant,ProductId=s.Serial,Value="CANDY-A",IsPrimary=true},new StorageBarcode{TenantId=t.Tenant,ProductId=s.Serial,Value="CANDY-B"},new StorageBarcode{TenantId=t.Tenant,ProductId=s.Bulk,Value="WEIGHT"},new StorageBarcode{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,Value="LOCATION"},new StorageBarcode{TenantId=t.Other,WarehouseId=(await db.StorageLocations.SingleAsync(x=>x.Id==s.OtherLocation)).WarehouseId,LocationId=s.OtherLocation,Value="OTHER-LOCATION"});await db.SaveChangesAsync();
    }
    static async Task<JsonElement> ReceiveCount(HttpClient c, Fixture t, Structure s, decimal count=20)
    {
        var r=Request(s);r.Lines=[new(){ProductId=s.Serial,ExpectedQuantity=count,LotNumber="CANDY-LOT"}];
        var d=await Post(c,t.Root,r);var url=t.Root+"/"+Id(Doc(d));
        d=await Post(c,url+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
        for(var i=0;i<count;i++) d=(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode=i%2==0?"CANDY-A":"CANDY-B"},HttpStatusCode.OK)).GetProperty("detail");
        d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),quantity=count,lotNumber="CANDY-LOT"}}},HttpStatusCode.OK);
        d=await Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=s.Location,quantity=count}}}}},HttpStatusCode.OK);
        return await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
    }
    [Fact] public async Task ScanTwentyAliasesReplayLimitsManualAndFinalStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);await ReceiveCount(c,t,s);
        var d=await Post(c,Root(t),OutRequest(s,20,true));d=await Action(c,t,d,"start-picking");var url=Root(t)+"/"+Id(Shipment(d));
        var loc=await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="LOCATION"},HttpStatusCode.OK);Assert.Equal(s.Location,loc.GetProperty("locationId").GetGuid());
        foreach(var stage in new[]{"picking","inspection"})
        {
            object? first=null;
            for(var i=0;i<20;i++) {var r=new{requestId=Guid.NewGuid(),barcode=i%2==0?"CANDY-A":"CANDY-B",locationId=s.Location};first??=r;var result=await Post(c,url+"/scan-"+stage,r,HttpStatusCode.OK);d=result.GetProperty("detail");Assert.Equal(i+1,d.GetProperty("allocations")[0].GetProperty(stage=="picking"?"pickedQuantity":"inspectedQuantity").GetDecimal());}
            Assert.True((await Post(c,url+"/scan-"+stage,first!,HttpStatusCode.OK)).GetProperty("replayed").GetBoolean());
            Assert.Equal("over-limit",(await Post(c,url+"/scan-"+stage,new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK)).GetProperty("outcome").GetString());
            Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/confirm",new{version=Version(Shipment(d))})).StatusCode);
            using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.SingleAsync();Assert.Equal(20,stock.Quantity);Assert.Equal(20,stock.ReservedQuantity);Assert.Single(await db.StockMovements.ToListAsync());}
            if(stage=="inspection") { d=await Work(c,t,d,stage,false,19);d=(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-B"},HttpStatusCode.OK)).GetProperty("detail"); }
            d=await Work(c,t,d,stage);
        }
        var original=d;d=await Action(c,t,d,"confirm");await Action(c,t,original,"confirm");
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var balance=await context.StockBalances.SingleAsync();Assert.Equal(0,balance.Quantity);Assert.Equal(0,balance.ReservedQuantity);Assert.Equal(2,await context.StockMovements.CountAsync());Assert.Equal(41,await context.ShipmentChanges.CountAsync(x=>x.ScanRequestId!=null));
    }
    [Fact] public async Task ScanSelectionSerialTrackingLocationMismatchAndSecurity()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);await Receive(c,t,s,true);
        var d=await Post(c,Root(t),OutRequest(s,2,true));d=await Action(c,t,d,"start-picking");var url=Root(t)+"/"+Id(Shipment(d));
        var selection=await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK);Assert.Equal("select-allocation",selection.GetProperty("outcome").GetString());Assert.Equal(2,selection.GetProperty("candidateAllocationIds").GetArrayLength());
        var first=d.GetProperty("allocations")[0];var requestId=Guid.NewGuid();var request=new{requestId,barcode="CANDY-A",allocationId=Id(first),locationId=s.Location};
        d=(await Post(c,url+"/scan-picking",request,HttpStatusCode.OK)).GetProperty("detail");
        Assert.Equal("over-limit",(await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="CANDY-A",allocationId=Id(first)},HttpStatusCode.OK)).GetProperty("outcome").GetString());
        Assert.Equal("select-allocation",(await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK)).GetProperty("outcome").GetString());
        foreach(var (body,status) in new (object,HttpStatusCode)[]{(new{requestId,barcode="CANDY-B",allocationId=Id(first),locationId=s.Location},HttpStatusCode.Conflict),(new{requestId=Guid.NewGuid(),barcode="CANDY-A",allocationId=Guid.NewGuid()},HttpStatusCode.BadRequest),(new{requestId=Guid.NewGuid(),barcode="CANDY-A",locationId=s.OtherLocation},HttpStatusCode.BadRequest),(new{requestId=Guid.NewGuid(),barcode="WEIGHT"},HttpStatusCode.BadRequest),(new{requestId=Guid.NewGuid(),barcode="OTHER-LOCATION"},HttpStatusCode.NotFound)}) Assert.Equal(status,(await AuthTests.Post(c,url+"/scan-picking",body)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
        await Login(c,t,"Reader");foreach(var stage in new[]{"picking","inspection"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/scan-"+stage,request)).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/scan-picking",request)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,$"/api/tenants/{t.Other}/shipments/{Id(Shipment(d))}/scan-picking",request)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1,(await db.ShipmentAllocations.ToListAsync()).Sum(a=>a.PickedQuantity));Assert.All(await db.StockBalances.ToListAsync(),a=>Assert.Equal(1,a.Quantity));
    }
    [Fact] public async Task MeasuredScanNeverCountsAndChangedStockTrackingIsRejected()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);await Receive(c,t,s);
        var d=await Post(c,Root(t),OutRequest(s));d=await Action(c,t,d,"start-picking");var url=Root(t)+"/"+Id(Shipment(d));
        Assert.Equal("manual",(await Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="WEIGHT"},HttpStatusCode.OK)).GetProperty("outcome").GetString());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(0,(await db.ShipmentAllocations.SingleAsync()).PickedQuantity);(await db.StockBalances.SingleAsync()).LotNumber="CHANGED";await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="WEIGHT"})).StatusCode);
    }
    [Fact] public async Task SplitLocationAndLotRequireSelectionForPickingAndInspection()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);await ReceiveCount(c,t,s);
        Guid secondLocation;
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.SingleAsync();stock.Quantity=10;
            var location=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="FLOOR-2",Name="두 번째 위치"};secondLocation=location.Id;db.Add(location);
            db.Add(new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=location.Id,ProductId=s.Serial,SourceKey="scan-location-qa",Quantity=10,Unit="EA",LotNumber="SECOND-LOT"});
            db.Add(new StorageBarcode{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=location.Id,Value="LOCATION-2"});await db.SaveChangesAsync();
        }
        var d=await Post(c,Root(t),OutRequest(s,20,true));d=await Action(c,t,d,"start-picking");var url=Root(t)+"/"+Id(Shipment(d));
        var first=Id(d.GetProperty("allocations")[0]);var second=Id(d.GetProperty("allocations")[1]);
        foreach(var stage in new[]{"picking","inspection"})
        {
            Assert.Equal("select-allocation",(await Post(c,url+"/scan-"+stage,new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK)).GetProperty("outcome").GetString());
            Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/scan-"+stage,new{requestId=Guid.NewGuid(),barcode="CANDY-A",locationId=secondLocation,allocationId=first})).StatusCode);
            var result=await Post(c,url+"/scan-"+stage,new{requestId=Guid.NewGuid(),barcode="CANDY-A",locationId=secondLocation},HttpStatusCode.OK);Assert.Equal(second,result.GetProperty("allocationId").GetGuid());d=result.GetProperty("detail");
            Assert.Equal(0,d.GetProperty("allocations")[0].GetProperty(stage=="picking"?"pickedQuantity":"inspectedQuantity").GetDecimal());
            Assert.Equal("SECOND-LOT",d.GetProperty("allocations")[1].GetProperty("lotNumber").GetString());
            d=await Work(c,t,d,stage);
        }
    }
}
