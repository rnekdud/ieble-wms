using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class WarehousePlanTests
{
    [Fact]
    public async Task DeletedStorageIsAbsentFromOperationsButRetainsHistoryAndOtherStock()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        Guid receiptId,productId,keepRack;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var actor=await db.Users.Where(x=>x.UserName=="Master").Select(x=>x.Id).SingleAsync();
            var rack=await db.WarehouseRacks.SingleAsync(x=>x.Id==t.Rack);
            var p=new Product{TenantId=t.Tenant,Code="ICE",NormalizedCode="ICE",Name="아이스크림"};productId=p.Id;
            var partner=new Partner{TenantId=t.Tenant,Code="PT",NormalizedCode="PT",Name="거래처"};
            var receipt=new InboundReceipt{TenantId=t.Tenant,WarehouseId=t.Warehouse,PartnerId=partner.Id,Number="IN-HISTORY",Status="Confirmed",ExpectedDate=DateOnly.FromDateTime(DateTime.UtcNow),InspectedAt=DateTimeOffset.UtcNow,ConfirmedAt=DateTimeOffset.UtcNow};receiptId=receipt.Id;
            var line=new InboundReceiptLine{TenantId=t.Tenant,ReceiptId=receipt.Id,ProductId=p.Id,ProductCode=p.Code,ProductName=p.Name,Unit="EA",ExpectedQuantity=5000,InspectedQuantity=5000,PlannedRackId=t.Rack,PlannedRackWarehouseId=t.Warehouse,Placements=[new(){LocationId=t.Location,LocationCode="A01-3-4",Quantity=5000}]};
            var old=new StockBalance{TenantId=t.Tenant,WarehouseId=t.Warehouse,LocationId=t.Location,ProductId=p.Id,ReceiptLineId=line.Id,SourceKey=$"{line.Id:N}:0",Quantity=0};
            var next=new WarehouseRack{TenantId=t.Tenant,WarehouseId=t.Warehouse,Code="KEEP",Name="보존 랙",Levels=1,Bays=1};keepRack=next.Id;
            var nextLoc=new StorageLocation{TenantId=t.Tenant,WarehouseId=t.Warehouse,RackId=next.Id,Level=1,Bay=1,Code="KEEP-1-1",Name="현재 위치"};
            var current=new StockBalance{TenantId=t.Tenant,WarehouseId=t.Warehouse,LocationId=nextLoc.Id,ProductId=p.Id,SourceKey="moved",Quantity=5000};
            db.AddRange(p,partner,receipt,line,old,next,nextLoc,current);
            db.Add(new StockMovement{TenantId=t.Tenant,StockId=old.Id,ReceiptId=receipt.Id,Type="ReceiptConfirmed",Quantity=5000,ActorId=actor,CreatedAt=DateTimeOffset.UtcNow});
            db.Add(new StorageBarcode{TenantId=t.Tenant,WarehouseId=t.Warehouse,RackId=t.Rack,Value="DELETED-RACK"});
            db.Add(new StorageBarcode{TenantId=t.Tenant,WarehouseId=t.Warehouse,LocationId=t.Location,Value="DELETED-LOCATION"});
            rack.DeletedAt=DateTimeOffset.UtcNow;
            foreach(var loc in await db.StorageLocations.Where(x=>x.RackId==t.Rack).ToListAsync())loc.DeletedAt=rack.DeletedAt;
            await db.SaveChangesAsync();
        }
        var detail=await c.GetFromJsonAsync<JsonElement>(Root(t));
        Assert.Single(detail.GetProperty("racks").EnumerateArray());
        Assert.Equal(keepRack,detail.GetProperty("racks")[0].GetProperty("id").GetGuid());
        foreach(var status in new[]{"all","active","inactive"}) {
            var locations=await c.GetFromJsonAsync<JsonElement>(Root(t)+$"/locations?status={status}&rackId={t.Rack}");
            Assert.Equal(0,locations.GetProperty("total").GetInt32());
        }
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(Root(t)+$"/racks/{t.Rack}/front")).StatusCode);
        foreach(var value in new[]{"DELETED-RACK","DELETED-LOCATION"}) {
            Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Tenant}/barcodes/lookup?value={value}")).StatusCode);
            var availability=await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/barcodes/check?value={value}");
            Assert.False(availability.GetProperty("available").GetBoolean());
        }
        var inbound=await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/receipts/{receiptId}");
        Assert.Equal("A01",inbound.GetProperty("lines")[0].GetProperty("plannedRackCode").GetString());
        using var verify=f.Services.CreateScope();var final=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Single(await final.WarehouseRacks.ToListAsync());Assert.Equal(2,await final.WarehouseRacks.IgnoreQueryFilters().CountAsync());
        Assert.Single(await final.StorageLocations.ToListAsync());Assert.Equal(13,await final.StorageLocations.IgnoreQueryFilters().CountAsync());
        Assert.True((await final.WarehouseRacks.IgnoreQueryFilters().SingleAsync(x=>x.Id==t.Rack)).IsActive);
        Assert.Equal(5000m,(await final.StockBalances.ToListAsync()).Sum(x=>x.Quantity));Assert.Equal(2,await final.StockBalances.CountAsync());
        var overview=verify.ServiceProvider.GetRequiredService<StockOverviewService>();
        var stock=JsonSerializer.SerializeToElement(await overview.List(t.Tenant,new(){View="location",ProductId=productId},default),new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Single(stock.GetProperty("items").EnumerateArray());Assert.Equal(5000,stock.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
        var history=verify.ServiceProvider.GetRequiredService<StockHistoryService>();
        var rows=await history.Rows(t.Tenant,new(){Search="아이스크림"},false).ToListAsync();
        Assert.Single(rows);Assert.Equal(t.Location,rows[0].LocationId);Assert.Equal(t.Rack,rows[0].RackId);Assert.Equal("A01",rows[0].RackCode);Assert.Equal(5000,rows[0].Quantity);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Foreign}/warehouses/{t.Warehouse}")).StatusCode);
    }
}
