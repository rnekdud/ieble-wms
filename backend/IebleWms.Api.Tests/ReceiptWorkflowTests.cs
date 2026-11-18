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

public sealed partial class ReceiptTests
{
    [Fact]
    public async Task PlannedRackPersistsAndChoicesSearchRackNamesWithoutRestrictingPlacementToThatRack()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var rack=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="RACK-Z",Name="입고 선반",Levels=2,Bays=3};
        var foreignWarehouse=new Warehouse{TenantId=t.Tenant,Code="WH-2",Name="두 번째 창고"};
        var wrongRack=new WarehouseRack{TenantId=t.Tenant,WarehouseId=foreignWarehouse.Id,Code="RACK-X",Name="다른 창고 랙",Levels=1,Bays=1};
        var location=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=rack.Id,Code="Z-1",Name="선반 위치",Level=1,Bay=1};
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.AddRange(rack,foreignWarehouse,wrongRack,location);(await db.Products.SingleAsync(p=>p.Id==s.Bulk)).RetailPrice=5000;await db.SaveChangesAsync();}
        var request=Request(s);request.Lines[0].PlannedRackId=rack.Id;
        var doc=await Post(c,t.Root,request);Assert.Equal(rack.Id,Line(doc).GetProperty("plannedRackId").GetGuid());Assert.Equal(5000,Line(doc).GetProperty("retailPrice").GetDecimal());
        var loaded=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(Doc(doc)));Assert.Equal("입고 선반",Line(loaded).GetProperty("plannedRackName").GetString());
        var choices=await c.GetFromJsonAsync<JsonElement>($"{t.Root}/choices?kind=locations&warehouseId={s.Warehouse}&rackId={rack.Id}");
        Assert.Equal(location.Id,choices.GetProperty("items")[0].GetProperty("id").GetGuid());Assert.Equal(2,choices.GetProperty("total").GetInt32());
        foreach(var search in new[]{"입고 선반","RACK-Z","Z-1"}){var found=await c.GetFromJsonAsync<JsonElement>($"{t.Root}/choices?kind=locations&warehouseId={s.Warehouse}&search={Uri.EscapeDataString(search)}");Assert.Equal(location.Id,found.GetProperty("items")[0].GetProperty("id").GetGuid());}
        var ranks=await c.GetFromJsonAsync<JsonElement>($"{t.Root}/choices?kind=racks&warehouseId={s.Warehouse}");Assert.Single(ranks.GetProperty("items").EnumerateArray());
        var foreign=await c.GetFromJsonAsync<JsonElement>($"{t.Root}/choices?kind=locations&warehouseId={Guid.NewGuid()}");Assert.Equal(0,foreign.GetProperty("total").GetInt32());
        request=Request(s);request.Lines[0].PlannedRackId=wrongRack.Id;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,request)).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await db.InboundReceipts.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());(await db.WarehouseRacks.SingleAsync(r=>r.Id==rack.Id)).IsActive=false;await db.SaveChangesAsync();}
        request=Request(s);request.Lines[0].PlannedRackId=rack.Id;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,request)).StatusCode);
    }

    [Fact]
    public async Task ManualAndScanShareQuantityAndInspectionLocksBeforeStockConfirmation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);
        var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=20});var url=t.Root+"/"+Id(Doc(d));
        for(var n=0;n<10;n++)d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK));
        d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=Id(Line(d)),quantity=15,reason="직접 수량 입력"},HttpStatusCode.OK));
        d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK));Assert.Equal(16,Scanned(d));
        d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),quantity=16}}},HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=Id(Line(d)),quantity=15,reason="차단 검증"})).StatusCode);
        foreach(var (quantity,word) in new[]{(21,"초과"),(11,"부족")}){
            var response=await AuthTests.Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),placements=new[]{new{locationId=s.Location,quantity}}}}});
            Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Contains(word,(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString());
        }
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());Assert.Empty(await db.StockMovements.ToListAsync());Assert.Equal(16,(await db.InboundReceiptLines.SingleAsync()).InspectedQuantity);
    }
}
