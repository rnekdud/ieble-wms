using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ProductTests
{
    [Fact] public async Task OptionalCodesUnitsPricesAndImageAreAtomicAndCostRequiresWriteAccess()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request("");r.Name="범용 상품";r.Unit="EA";r.ModelNumber="M-1";r.Origin="대한민국";r.CostPrice=1234.56m;r.RetailPrice=2000;r.WeightGrams=500;r.WidthCm=12.5m;r.BoxWeightGrams=750;
        r.Image=new(){FileName="sample.png",Base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="};
        var p=await Post(c,t.Root,r);Assert.Equal("PR01",p.GetProperty("code").GetString());Assert.Equal(JsonValueKind.Null,p.GetProperty("barcode").ValueKind);Assert.Equal(500,p.GetProperty("weightGrams").GetDecimal());
        Assert.Equal(Id(p),Id(await Post(c,t.Root,r)));
        var second=await Post(c,t.Root,Request(" "));Assert.Equal("PR02",second.GetProperty("code").GetString());
        var detail=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));Assert.Equal(1234.56m,detail.GetProperty("product").GetProperty("costPrice").GetDecimal());
        var image=await c.GetAsync(t.Root+"/"+Id(p)+"/image");Assert.Equal("image/png",image.Content.Headers.ContentType?.MediaType);Assert.Equal(Convert.FromBase64String(r.Image.Base64),await image.Content.ReadAsByteArrayAsync());
        await Login(c,t,"Reader");detail=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));Assert.False(detail.GetProperty("canViewCost").GetBoolean());Assert.Equal(JsonValueKind.Null,detail.GetProperty("product").GetProperty("costPrice").ValueKind);
        var list=await c.GetStringAsync(t.Root);Assert.DoesNotContain("1234.56",list);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/products/{Id(p)}/image")).StatusCode);
        await Login(c,t);r=Request("");r.Image=new(){FileName="bad.png",Base64=Convert.ToBase64String("bad bytes"u8.ToArray())};Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,r)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.Products.CountAsync());Assert.Single(await db.ProductImages.ToListAsync());
        foreach(var unit in ProductUnits.Codes){r=Request("UNIT-"+Guid.NewGuid().ToString("N"));r.Unit=unit;if(unit=="EA")await Post(c,t.Root,r);else Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,r)).StatusCode);}
    }
    [Fact] public async Task MultipleBarcodesLookupSecondaryUpdatePrimaryAndConflictRollbackPreserveIdentity()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request("");r.Barcodes=[new(){Change=new(){Mode="manual",Value="ALIAS-1"},IsPrimary=true},new(){Change=new(){Mode="manual",Value="ALIAS-2"},Description="포장용"}];
        var p=await Post(c,t.Root,r);var id=Id(p);Assert.Equal(2,p.GetProperty("barcodes").GetArrayLength());
        foreach(var value in new[]{"ALIAS-1","ALIAS-2"}){var lookup=await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/barcodes/lookup?value={value}");Assert.Equal(id,Id(lookup.GetProperty("item")));}
        var searched=await c.GetFromJsonAsync<JsonElement>(t.Root+"?search=ALIAS-2");Assert.Equal(1,searched.GetProperty("total").GetInt32());
        var labels=p.GetProperty("barcodes").EnumerateArray().ToArray();r.Version=Version(p);r.Barcodes=[new(){Id=Id(labels[0]),IsPrimary=false},new(){Id=Id(labels[1]),IsPrimary=true}];
        p=await Post(c,t.Root+"/"+id,r,HttpStatusCode.OK);Assert.Equal("ALIAS-2",p.GetProperty("barcode").GetString());
        var previousVersion=Version(p);r.Version=previousVersion;r.Barcodes![0].Description="설명만 수정";p=await Post(c,t.Root+"/"+id,r,HttpStatusCode.OK);Assert.NotEqual(previousVersion,Version(p));Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id,r)).StatusCode);
        var other=await Post(c,t.Root,Request("OTHER","TAKEN"));r.Version=Version(p);r.Barcodes=[new(){Id=Id(labels[0]),IsPrimary=true,Change=new(){Mode="manual",Value="TAKEN"}}];
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+id,r)).StatusCode);
        var detail=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+id);Assert.Equal(2,detail.GetProperty("product").GetProperty("barcodes").GetArrayLength());Assert.Equal("ALIAS-2",detail.GetProperty("product").GetProperty("barcode").GetString());
        r.Barcodes=[];p=await Post(c,t.Root+"/"+id,r,HttpStatusCode.OK);Assert.Equal(id,Id(p));Assert.Equal(JsonValueKind.Null,p.GetProperty("barcode").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Tenant}/barcodes/lookup?value=ALIAS-2")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync($"/api/tenants/{t.Tenant}/barcodes/product/{id}/history")).StatusCode);
    }
    [Fact] public async Task CategoryTreeRejectsCyclesDepthForeignParentsAndPreservesInactiveReferences()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var a=await Post(c,t.Root+"/categories",new{name="1차"},HttpStatusCode.OK);
        var b=await Post(c,t.Root+"/categories",new{name="2차",parentId=Id(a)},HttpStatusCode.OK);
        var d=await Post(c,t.Root+"/categories",new{name="3차",parentId=Id(b)},HttpStatusCode.OK);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/categories",new{name="4차",parentId=Id(d)})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/categories/"+Id(a),new{name="순환",parentId=Id(d),version=Version(a)})).StatusCode);
        var type=await Post(c,t.Root+"/types",new{name="기업 부품"},HttpStatusCode.OK);var r=Request("");r.CategoryId=Id(d);r.ProductTypeId=Id(type);var p=await Post(c,t.Root,r);
        Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?categoryId="+Id(a))).GetProperty("total").GetInt32());
        await Post(c,t.Root+"/categories/"+Id(d),new{name="3차 보존",parentId=Id(b),version=Version(d),isActive=false},HttpStatusCode.OK);
        r.Version=Version(p);await Post(c,t.Root+"/"+Id(p),r,HttpStatusCode.OK);
        var invalid=Request("NEW");invalid.CategoryId=Id(d);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,invalid)).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,$"/api/tenants/{t.Other}/products/categories",new{name="다른 기업",parentId=Id(a)})).StatusCode);
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root+"/types",new{name="차단"})).StatusCode);
    }
}

public sealed partial class ReceiptTests
{
    [Fact] public async Task OptionalTrackingOnSameProductPreservesSeparateStockAndSerialReservations()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        // All legacy flags are false on this product. Each line independently chooses tracking data.
        var r=Request(s);r.Lines=[new(){ProductId=s.Bulk,ExpectedQuantity=2.5m},new(){ProductId=s.Bulk,ExpectedQuantity=2,LotNumber="LOT"},new(){ProductId=s.Bulk,ExpectedQuantity=3,ExpiryDate=new(2027,1,1)},new(){ProductId=s.Bulk,ExpectedQuantity=1,Serials=["OPTIONAL-SERIAL"]}];
        var d=await Post(c,t.Root,r);var id=Id(Doc(d));d=await Post(c,t.Root+"/"+id+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
        var lines=d.GetProperty("lines").EnumerateArray().ToArray();
        d=await Post(c,t.Root+"/"+id+"/inspection",new{version=Version(Doc(d)),lines=lines.Select(l=>new{lineId=Id(l),quantity=l.GetProperty("expectedQuantity").GetDecimal(),lotNumber=l.GetProperty("lotNumber").GetString(),expiryDate=l.GetProperty("expiryDate").GetString(),serials=l.GetProperty("serials").EnumerateArray().Select(v=>v.GetString()).ToArray()})},HttpStatusCode.OK);
        d=await Post(c,t.Root+"/"+id+"/placements",new{version=Version(Doc(d)),lines=lines.Select(l=>new{lineId=Id(l),placements=new[]{new{locationId=s.Location,quantity=l.GetProperty("expectedQuantity").GetDecimal(),serials=l.GetProperty("serials").EnumerateArray().Select(v=>v.GetString()).ToArray()}}})},HttpStatusCode.OK);
        await Post(c,t.Root+"/"+id+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var balances=await db.StockBalances.ToListAsync();Assert.Equal(4,balances.Count);Assert.Equal(8.5m,balances.Sum(x=>x.Quantity));Assert.Single(balances,x=>x.SerialNumber!=null);Assert.False((await db.Products.SingleAsync(x=>x.Id==s.Bulk)).SerialManaged);}
        var ship=new ShipmentRequest{RequestId=Guid.NewGuid(),RequestDate=new(2026,11,2),ExpectedDate=new(2026,11,2),WarehouseId=s.Warehouse,PartnerId=s.Partner,ContactName="담당",Lines=[new(){ProductId=s.Bulk,RequestedQuantity=1,Serials=["OPTIONAL-SERIAL"]}]};
        var result=await Post(c,$"/api/tenants/{t.Tenant}/shipments",ship);Assert.Equal("OPTIONAL-SERIAL",result.GetProperty("allocations")[0].GetProperty("serialNumber").GetString());
        ship.RequestId=Guid.NewGuid();Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,$"/api/tenants/{t.Tenant}/shipments",ship)).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(8.5m,await db.StockBalances.SumAsync(x=>x.Quantity));Assert.Equal(1m,await db.StockBalances.SumAsync(x=>x.ReservedQuantity));}
        // Legacy true flags do not require values on newly entered documents either.
        r=Request(s,true);r.Lines[0].LotNumber=null;r.Lines[0].ExpiryDate=null;r.Lines[0].Serials=[];await Post(c,t.Root,r);
    }
}
