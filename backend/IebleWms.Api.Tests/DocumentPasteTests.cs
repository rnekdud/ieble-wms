using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Xml.Linq;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed partial class ShipmentTests
{
    [Theory][InlineData("receipts", "예정 수량")][InlineData("shipments", "요청 수량")]
    public async Task PasteChoicesMatchExactlyRemainPagedAndNeverChangeDocuments(string document, string quantityLabel)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Setup(f,t);await Login(c,t);
        var longName=new string('가',150);
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            for(var i=0;i<35;i++)db.Products.Add(new(){TenantId=t.Tenant,Code=$"MATCH-{i:00}",NormalizedCode=$"MATCH-{i:00}",Name="동일 상품",Unit="EA",ModelNumber=$"MODEL-{i:00}",CreationRequestId=Guid.NewGuid()});
            foreach(var (tenant,code,name,unit,active) in new[]{(t.Tenant,"KG","동일 상품","kg",true),(t.Tenant,"OFF","중지 상품","EA",false),(t.Tenant,"SUBSTRING","동일 상품 추가","EA",true),(t.Tenant,"LONG",longName,"EA",true),(t.Other,"OTHER","타사 상품","EA",true),(t.Other,"OTHER-SAME","동일 상품","EA",true)})db.Products.Add(new(){TenantId=tenant,Code=code,NormalizedCode=code,Name=name,Unit=unit,IsActive=active,CreationRequestId=Guid.NewGuid()});
            await db.SaveChangesAsync();
        }
        var root=$"/api/tenants/{t.Tenant}/{document}";
        async Task<JsonElement> Choices(string name,string? unit=null,int page=1)=>await c.GetFromJsonAsync<JsonElement>(root+"/choices?kind=products&exactName="+Uri.EscapeDataString(name)+(unit==null?"":"&exactUnit="+Uri.EscapeDataString(unit))+"&page="+page);
        var first=await Choices("동일 상품");Assert.Equal(36,first.GetProperty("total").GetInt32());Assert.Equal(30,first.GetProperty("pageSize").GetInt32());Assert.Equal(30,first.GetProperty("items").GetArrayLength());
        var second=await Choices("동일 상품",page:2);Assert.Equal(6,second.GetProperty("items").GetArrayLength());
        Assert.Empty(first.GetProperty("items").EnumerateArray().Select(Id).Intersect(second.GetProperty("items").EnumerateArray().Select(Id)));
        Assert.All(first.GetProperty("items").EnumerateArray(),p=>{Assert.Equal("동일 상품",p.GetProperty("name").GetString());Assert.Contains(p.GetProperty("unit").GetString(),new[]{"EA","kg"}); if(p.GetProperty("unit").GetString()=="EA")Assert.StartsWith("MODEL-",p.GetProperty("modelNumber").GetString());});
        Assert.Equal(36,(await Choices("동일 상품",null)).GetProperty("total").GetInt32());Assert.Equal(1,(await Choices("동일 상품","kg")).GetProperty("total").GetInt32());
        foreach(var name in new[]{"동일","중지 상품","타사 상품","미등록"})Assert.Equal(0,(await Choices(name)).GetProperty("total").GetInt32());
        Assert.Equal(0,(await Choices("동일 상품","ea")).GetProperty("total").GetInt32());Assert.Equal(1,(await Choices(longName)).GetProperty("total").GetInt32());
        foreach(var query in new[]{"kind=partners&exactName=test","kind=products&exactName="+new string('a',201)})Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(root+"/choices?"+query)).StatusCode);
        var template=await c.GetAsync(root+"/paste-template");Assert.Equal(HttpStatusCode.OK,template.StatusCode);Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",template.Content.Headers.ContentType!.MediaType);
        using var zip=new ZipArchive(new MemoryStream(await template.Content.ReadAsByteArrayAsync()));using var sheet=zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=XDocument.Load(sheet);XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        Assert.Equal(new[]{"상품명",quantityLabel},xml.Descendants(ns+"t").Select(x=>x.Value));Assert.Single(xml.Descendants(ns+"row"));
        var legacyFormat=await c.GetAsync(root+"/paste-template?format=csv");Assert.Equal(HttpStatusCode.OK,legacyFormat.StatusCode);Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",legacyFormat.Content.Headers.ContentType!.MediaType);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/choices?kind=products&exactName=test")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/paste-template")).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await context.InboundReceipts.ToListAsync());Assert.Empty(await context.OutboundShipments.ToListAsync());Assert.Empty(await context.StockBalances.ToListAsync());Assert.Empty(await context.ShipmentAllocations.ToListAsync());
    }
}
