using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ReceiptTests
{
    const string PhotoPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    static ReceiptPhotoRequest PhotoUpload(string name = "입고.png") => new() { FileName = name, ContentType = "image/png", Base64 = PhotoPng, ThumbnailBase64 = PhotoJpeg };
    static ReceiptPhotosRequest PhotoUpdate(JsonElement gallery, params ReceiptPhotoRequest[] photos) => new() { Version = gallery.GetProperty("version").GetGuid(), PhotosVersion = gallery.GetProperty("photosVersion").GetString()!, Photos = photos };
    static async Task<JsonElement> Gallery(HttpClient c, string url) => await c.GetFromJsonAsync<JsonElement>(url + "/photos");
    [Fact]
    public async Task ReceiptPhotosPersistAtomicallyAndFollowStatusWithoutChangingInventory()
    {
        using var f = new AuthFactory(); using var c = f.Client(); var t = await Seed(f); var s = await Setup(f,t); await Login(c,t);
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(t.Root+"/photo-options")).StatusCode);
        var request = Request(s); request.Photos = [PhotoUpload(), PhotoUpload("추가.png")];
        var detail = await Post(c,t.Root,request); var url = t.Root + "/" + Id(Doc(detail));
        var replay = await Post(c,t.Root,request); Assert.Equal(Id(Doc(detail)),Id(Doc(replay)));
        var gallery = await Gallery(c,url); Assert.Equal(2,gallery.GetProperty("photos").GetArrayLength());
        var first = Id(gallery.GetProperty("photos")[0]); var second = Id(gallery.GetProperty("photos")[1]);
        var original = await c.GetAsync(url+"/photos/"+first); Assert.Equal(Convert.FromBase64String(PhotoPng),await original.Content.ReadAsByteArrayAsync());
        Assert.True(original.Headers.CacheControl?.NoStore); Assert.Equal("nosniff",Assert.Single(original.Headers.GetValues("X-Content-Type-Options")));
        var thumb = await c.GetAsync(url+"/photos/"+first+"?thumbnail=true"); Assert.Equal("image/jpeg",thumb.Content.Headers.ContentType?.MediaType); Assert.Equal(Convert.FromBase64String(PhotoJpeg),await thumb.Content.ReadAsByteArrayAsync());
        var update = PhotoUpdate(gallery,new ReceiptPhotoRequest(){Id=second},PhotoUpload("세 번째.png"));
        var saved = await Post(c,url+"/photos",update,HttpStatusCode.OK); Assert.Equal("Planned",Doc(saved.GetProperty("detail")).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(url+"/photos/"+first)).StatusCode);
        Assert.Equal(second,Id((await Gallery(c,url)).GetProperty("photos")[0]));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/photos",update)).StatusCode);
        var current = await c.GetFromJsonAsync<JsonElement>(url);
        current = await Post(c,url+"/start-inspection",new{version=Version(Doc(current))},HttpStatusCode.OK);
        gallery=await Gallery(c,url); Assert.Equal(2,gallery.GetProperty("photos").GetArrayLength());
        await Post(c,url+"/photos",PhotoUpdate(gallery,new ReceiptPhotoRequest(){Id=second}),HttpStatusCode.OK);
        current=await c.GetFromJsonAsync<JsonElement>(url);
        current=await Post(c,url+"/inspection",new{version=Version(Doc(current)),lines=new[]{new{lineId=Id(Line(current)),quantity=1m,serials=Array.Empty<string>()}}},HttpStatusCode.OK);
        current=await Post(c,url+"/placements",new{version=Version(Doc(current)),lines=new[]{new{lineId=Id(Line(current)),placements=new[]{new{locationId=s.Location,quantity=1m,serials=Array.Empty<string>()}}}}},HttpStatusCode.OK);
        // Photos remain editable before final receipt confirmation, including after inspection.
        gallery=await Gallery(c,url); await Post(c,url+"/photos",PhotoUpdate(gallery,new ReceiptPhotoRequest(){Id=second}),HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());Assert.Empty(await db.StockMovements.ToListAsync());}
        current=await c.GetFromJsonAsync<JsonElement>(url); await Post(c,url+"/confirm",new{version=Version(Doc(current))},HttpStatusCode.OK);
        gallery=await Gallery(c,url); Assert.Single(gallery.GetProperty("photos").EnumerateArray());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/photos",PhotoUpdate(gallery))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(url+"/photos/"+second)).StatusCode);
    }
    [Fact]
    public async Task ReceiptPhotoValidationRollbackOwnershipAndPermissions()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var bad=Request(s);bad.Photos=[PhotoUpload("bad.heic")];
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,bad)).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.InboundReceipts.ToListAsync());Assert.Empty(await db.ReceiptPhotos.ToListAsync());}
        var req=Request(s);req.Photos=[PhotoUpload()];var detail=await Post(c,t.Root,req);var url=t.Root+"/"+Id(Doc(detail));var gallery=await Gallery(c,url);var photoId=Id(gallery.GetProperty("photos")[0]);
        var another=await Post(c,t.Root,Request(s));var otherUrl=t.Root+"/"+Id(Doc(another));
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,otherUrl+"/photos",PhotoUpdate(await Gallery(c,otherUrl),new ReceiptPhotoRequest(){Id=photoId}))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(otherUrl+"/photos/"+photoId)).StatusCode);
        var invalid=PhotoUpload();invalid.Base64="not base64";
        var oversized=PhotoUpload();oversized.Base64=Convert.ToBase64String(new byte[5*1024*1024+1]);
        var mime=PhotoUpload();mime.ContentType="text/html";
        foreach(var input in new[]{invalid,oversized,mime,PhotoUpload("bad.svg")})Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/photos",PhotoUpdate(gallery,input))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/photos",PhotoUpdate(gallery,Enumerable.Range(0,11).Select(_=>PhotoUpload()).ToArray()))).StatusCode);
        Assert.Equal(photoId,Id((await Gallery(c,url)).GetProperty("photos")[0]));
        var ten=await Post(c,url+"/photos",PhotoUpdate(gallery,Enumerable.Range(0,10).Select(i=>PhotoUpload(i+".png")).ToArray()),HttpStatusCode.OK);
        Assert.Equal(10,ten.GetProperty("gallery").GetProperty("photos").GetArrayLength());
        var stale=PhotoUpdate(ten.GetProperty("gallery"));stale.PhotosVersion=gallery.GetProperty("photosVersion").GetString()!;
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/photos",stale)).StatusCode);
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(url+"/photos")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/photos",PhotoUpdate(ten.GetProperty("gallery")))).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url+"/photos")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/receipts/{Id(Doc(detail))}/photos/{photoId}")).StatusCode);
        using var anon=f.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anon.GetAsync(url+"/photos")).StatusCode);
    }
    [Fact]
    public async Task ReceiptPhotosWebpJpegLegacyUpdateAndCancelledReadOnly()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var request=Request(s);request.Photos=[new(){FileName="카메라.jpg",ContentType="image/jpeg",Base64=PhotoJpeg,ThumbnailBase64=PhotoJpeg},new(){FileName="사진.webp",ContentType="image/webp",Base64="UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",ThumbnailBase64=PhotoJpeg}];
        var d=await Post(c,t.Root,request);var url=t.Root+"/"+Id(Doc(d));var gallery=await Gallery(c,url);var webpId=Id(gallery.GetProperty("photos")[1]);
        var image=await c.GetAsync(url+"/photos/"+webpId);Assert.Equal("image/webp",image.Content.Headers.ContentType?.MediaType);
        var legacy=Request(s);legacy.Version=Version(Doc(d));await Post(c,url,legacy,HttpStatusCode.OK);
        Assert.Equal(2,(await Gallery(c,url)).GetProperty("photos").GetArrayLength());
        d=await c.GetFromJsonAsync<JsonElement>(url);await Post(c,url+"/cancel",new{version=Version(Doc(d))},HttpStatusCode.OK);
        gallery=await Gallery(c,url);Assert.Equal(2,gallery.GetProperty("photos").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(url+"/photos/"+webpId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/photos",PhotoUpdate(gallery))).StatusCode);
    }
    // A real tiny JPEG thumbnail, generated only for this isolated test fixture.
    const string PhotoJpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwChQE8jQ//Z";
}
