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

public sealed partial class ProductTests
{
    const string GalleryPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    static ProductGalleryImageRequest Upload(string name)=>new(){FileName=name,ContentType="image/png",Base64=GalleryPng};
    [Fact] public async Task GalleryOrdersPrimaryLegacyCompatibilityAndAtomicRollback()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request("GALLERY");r.Images=[Upload("first.png"),Upload("second.png"),Upload("third.png")];
        var p=await Post(c,t.Root,r);var id=Id(p);var url=t.Root+"/"+id;
        var images=p.GetProperty("images").EnumerateArray().ToArray();Assert.Equal(3,images.Length);Assert.True(images[0].GetProperty("isPrimary").GetBoolean());
        Assert.Equal(Id(p),Id(await Post(c,t.Root,r))); // idempotent retry
        r.Version=Version(p);r.Images=[new(){Id=Id(images[2])},new(){Id=Id(images[0]),IsPrimary=true},new(){Id=Id(images[1])}];
        p=await Post(c,url,r,HttpStatusCode.OK);Assert.Equal(Id(images[2]),Id(p.GetProperty("images")[0]));
        var bytes=await c.GetByteArrayAsync(url+"/images/"+Id(images[0]));Assert.Equal(Convert.FromBase64String(GalleryPng),bytes);
        Assert.Equal(bytes,await c.GetByteArrayAsync(url+"/image"));
        var currentVersion=Version(p);Assert.NotEqual(r.Version,currentVersion);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url,r)).StatusCode);
        // A later barcode conflict rolls back earlier image removal/reordering AND product changes.
        await Post(c,t.Root,Request("OTHER-GALLERY","TAKEN-GALLERY"));r.Version=currentVersion;r.Name="must rollback";r.Images=[];r.Barcodes=[new(){Change=new(){Mode="manual",Value="TAKEN-GALLERY"},IsPrimary=true}];
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url,r)).StatusCode);
        var restored=(await c.GetFromJsonAsync<JsonElement>(url)).GetProperty("product");Assert.Equal(3,restored.GetProperty("images").GetArrayLength());Assert.Equal(currentVersion,Version(restored));Assert.NotEqual("must rollback",restored.GetProperty("name").GetString());
        r.Barcodes=null;r.Images=null;r.Image=new(){Remove=true};p=await Post(c,url,r,HttpStatusCode.OK);Assert.Equal(2,p.GetProperty("images").GetArrayLength());Assert.True(p.GetProperty("images")[0].GetProperty("isPrimary").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(url+"/images/"+Id(images[0]))).StatusCode);
        r.Version=Version(p);r.Image=null;r.Images=[];p=await Post(c,url,r,HttpStatusCode.OK);Assert.False(p.GetProperty("hasImage").GetBoolean());Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(url+"/image")).StatusCode);
    }
    [Fact] public async Task GalleryRejectsInvalidFilesForeignImagesAndUnauthorizedChanges()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request("SAFE");r.Images=[Upload("safe.png")];var p=await Post(c,t.Root,r);var url=t.Root+"/"+Id(p);var imageId=Id(p.GetProperty("images")[0]);
        var other=Request("FOREIGN");other.Images=[Upload("foreign.png")];var p2=await Post(c,t.Root,other);
        r.Version=Version(p);r.Images=[new(){Id=Id(p2.GetProperty("images")[0])}];Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=[Upload("invalid.png")];r.Images[0].ContentType="image/jpeg";Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=[Upload("invalid.exe")];Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=[Upload("invalid.png")];r.Images[0].Base64=Convert.ToBase64String("not png"u8.ToArray());Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=Enumerable.Range(0,9).Select(i=>Upload(i+".png")).ToArray();Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=[Upload("a.png"),Upload("b.png")];foreach(var image in r.Images)image.IsPrimary=true;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        r.Images=[Upload("big.png")];r.Images[0].Base64=Convert.ToBase64String(new byte[2*1024*1024+1]);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,r)).StatusCode);
        await Login(c,t,"Reader");r.Images=[];Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url,r)).StatusCode);Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(url+"/images/"+imageId)).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url+"/images/"+imageId)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/products/{Id(p)}/images/{imageId}")).StatusCode);
        await Login(c,t);var retained=(await c.GetFromJsonAsync<JsonElement>(url)).GetProperty("product");Assert.Equal(imageId,Id(retained.GetProperty("images")[0]));Assert.Equal(Version(p),Version(retained));
    }
}
public sealed partial class ReceiptTests
{
    [Fact] public async Task SearchChoicesFindsBusinessNumberModelAndAllBarcodesWithActiveTenantPaging()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=await db.Products.SingleAsync(x=>x.Id==s.Bulk);p.ModelNumber="MODEL-SEARCH";
            db.StorageBarcodes.AddRange(new StorageBarcode{TenantId=t.Tenant,ProductId=p.Id,Value="PRIMARY-SEARCH",IsPrimary=true},new StorageBarcode{TenantId=t.Tenant,ProductId=p.Id,Value="ALIAS-SEARCH"});
            var partner=await db.Partners.SingleAsync(x=>x.Id==s.Partner);partner.NormalizedBusinessNumber="1234567890";partner.BusinessRegistrationNumber="123-45-67890";
            for(var i=0;i<35;i++)db.Products.Add(new(){TenantId=t.Tenant,Code=$"PAGE-{i:D2}",NormalizedCode=$"PAGE-{i:D2}",Name="페이지 상품",CreationRequestId=Guid.NewGuid()});
            await db.SaveChangesAsync();
        }
        foreach(var term in new[]{"MODEL-SEARCH","PRIMARY-SEARCH","ALIAS-SEARCH","BULK","중량"}){var result=await c.GetFromJsonAsync<JsonElement>(t.Root+"/choices?kind=products&search="+Uri.EscapeDataString(term));Assert.Equal(s.Bulk,Id(result.GetProperty("items")[0]));Assert.Equal(1,result.GetProperty("total").GetInt32());}
        foreach(var term in new[]{"1234567890","123-45-67890","SUP","매입처"}){var result=await c.GetFromJsonAsync<JsonElement>(t.Root+"/choices?kind=partners&search="+Uri.EscapeDataString(term));Assert.Equal(s.Partner,Id(result.GetProperty("items")[0]));}
        var page1=await c.GetFromJsonAsync<JsonElement>(t.Root+"/choices?kind=products&search=PAGE-&page=1");var page2=await c.GetFromJsonAsync<JsonElement>(t.Root+"/choices?kind=products&search=PAGE-&page=2");Assert.Equal(35,page1.GetProperty("total").GetInt32());Assert.Equal(30,page1.GetProperty("items").GetArrayLength());Assert.Equal(5,page2.GetProperty("items").GetArrayLength());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.Products.SingleAsync(x=>x.Id==s.Bulk)).IsActive=false;(await db.Warehouses.SingleAsync(x=>x.Id==s.Warehouse)).IsActive=false;(await db.Partners.SingleAsync(x=>x.Id==s.Partner)).Type="CUSTOMER";await db.SaveChangesAsync();}
        foreach(var (kind,search) in new[]{("products","ALIAS-SEARCH"),("warehouses","WH-1"),("partners","SUP")})Assert.Equal(0,(await c.GetFromJsonAsync<JsonElement>(t.Root+$"/choices?kind={kind}&search={search}")).GetProperty("total").GetInt32());
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root+"/choices?kind=products")).StatusCode);
    }
}
