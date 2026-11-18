using System.Net;
using IebleWms.Api.Data;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ShipmentTests
{
    [Fact]
    public async Task MoreThan100ProductsCanBeReceivedInspectedPlacedAndShipped()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var products=Enumerable.Range(0,101).Select(i=>new Product{TenantId=t.Tenant,Code=$"MANY-{i:000}",NormalizedCode=$"MANY-{i:000}",Name=$"상품 {i}",Unit="EA",CreationRequestId=Guid.NewGuid()}).ToArray();
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.AddRange(products);await db.SaveChangesAsync();}
        var request=Request(s);request.Lines=products.Select(p=>new ReceiptLineRequest{ProductId=p.Id,ExpectedQuantity=1}).ToArray();
        var receipt=await Post(c,t.Root,request);Assert.Equal(101,receipt.GetProperty("lines").GetArrayLength());
        var url=t.Root+"/"+Id(Doc(receipt));
        request.Version=Version(Doc(receipt));request.Lines=receipt.GetProperty("lines").EnumerateArray().Select(l=>new ReceiptLineRequest{LineId=Id(l),ProductId=l.GetProperty("productId").GetGuid(),ExpectedQuantity=1}).ToArray();
        receipt=await Post(c,url,request,HttpStatusCode.OK);
        receipt=await Post(c,url+"/start-inspection",new{version=Version(Doc(receipt))},HttpStatusCode.OK);
        receipt=await Post(c,url+"/inspection",new{version=Version(Doc(receipt)),lines=receipt.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),quantity=1}).ToArray()},HttpStatusCode.OK);
        receipt=await Post(c,url+"/placements",new{version=Version(Doc(receipt)),lines=receipt.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),placements=new[]{new{locationId=s.Location,quantity=1}}}).ToArray()},HttpStatusCode.OK);
        await Post(c,url+"/confirm",new{version=Version(Doc(receipt))},HttpStatusCode.OK);
        var outgoing=OutRequest(s);outgoing.Lines=products.Select(p=>new ShipmentLineRequest{ProductId=p.Id,RequestedQuantity=1}).ToArray();
        var shipment=await Post(c,Root(t),outgoing);Assert.Equal(101,shipment.GetProperty("lines").GetArrayLength());Assert.Equal(101,shipment.GetProperty("allocations").GetArrayLength());
        outgoing.Version=Version(Shipment(shipment));shipment=await Post(c,Root(t)+"/"+Id(Shipment(shipment)),outgoing,HttpStatusCode.OK);
        shipment=await Action(c,t,shipment,"start-picking");shipment=await Work(c,t,shipment,"picking");shipment=await Work(c,t,shipment,"inspection");shipment=await Action(c,t,shipment,"confirm");
        Assert.Equal("Confirmed",Shipment(shipment).GetProperty("status").GetString());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(101,await db.StockBalances.CountAsync());Assert.All(await db.StockBalances.ToListAsync(),x=>{Assert.Equal(0,x.Quantity);Assert.Equal(0,x.ReservedQuantity);});}
    }
}
