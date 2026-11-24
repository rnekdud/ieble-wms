using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Labels;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PdfSharp.Pdf.IO;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ReceiptTests
{
    static LabelPaper LabelPaperFixture()=>new(){Id="formtec-3107",Name="폼텍 3107",Width=210,Height=297,LabelWidth=99.1,LabelHeight=33.9,Left=4.7,Top=14.2,GapX=2.5,Columns=2,Rows=8};
    const string LabelPng="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGP8P40BK2DCLjxYJQBBVAGlf4IUrQAAAABJRU5ErkJggg==";
    static SaveLabelDesign LabelRequest()=>new(){RequestId=Guid.NewGuid(),Name="한글 원문 000123",Document=new(){Paper=LabelPaperFixture(),Images=new(){["logo"]=LabelPng},Labels=[new(){Objects=[new(){Id="text",Text="원문 상품명",X=2,Y=2,Width=40,Height=10},new(){Id="image",Kind="image",ImageId="logo",X=50,Y=2,Width=10,Height=10},new(){Id="barcode",Kind="barcode",Text="000123",X=2,Y=15,Width=70,Height=15}]}]}};
    [Fact]
    public async Task LabelTemplatesPersistImagesSnapshotsVersionsAndTenantIsolation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var root=$"/api/tenants/{t.Tenant}/label-designs";
        var req=LabelRequest();req.Document.Labels[0].Objects[0].Binding=new(){ProductId=s.Bulk,Field="name",CapturedAt="2026-11-23T00:00:00Z"};
        var created=await Post(c,root,req);var id=Id(created);Assert.Equal(id,Id(await Post(c,root,req)));
        using(var otherBrowser=f.Client()){await Login(otherBrowser,t);var loaded=await otherBrowser.GetFromJsonAsync<JsonElement>(root+"/"+id);Assert.Equal(LabelPng,loaded.GetProperty("document").GetProperty("images").GetProperty("logo").GetString());Assert.Equal("원문 상품명",loaded.GetProperty("document").GetProperty("labels")[0].GetProperty("objects")[0].GetProperty("text").GetString());}
        req.Version=Version(created);req.Name="수정 템플릿";var changed=await Post(c,root+"/"+id,req,HttpStatusCode.OK);Assert.NotEqual(req.Version,Version(changed));Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root+"/"+id,req)).StatusCode);
        req.RequestId=Guid.NewGuid();var duplicate=await Post(c,root,req);Assert.NotEqual(id,Id(duplicate));
        var paper=new SaveLabelDesign{RequestId=Guid.NewGuid(),Name="내 용지",Kind="paper",Document=new(){Paper=LabelPaperFixture()}};var savedPaper=await Post(c,root,paper);
        var list=await c.GetFromJsonAsync<JsonElement>(root+"?kind=template");Assert.Equal(2,list.GetProperty("total").GetInt32());Assert.Equal(20,list.GetProperty("pageSize").GetInt32());Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(root+"?kind=paper")).GetProperty("total").GetInt32());
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root)).StatusCode);var foreign=$"/api/tenants/{t.Other}/label-designs";Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(foreign+"/"+id)).StatusCode);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,foreign+"/"+id,req)).StatusCode);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,foreign,req)).StatusCode);
        await Login(c,t);await Post(c,root+"/"+id+"/archive",new{version=Version(changed)},HttpStatusCode.OK);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/"+id)).StatusCode);Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(root+"/"+Id(duplicate))).StatusCode);Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(root+"/"+Id(savedPaper))).StatusCode);
        var pdf=await AuthTests.Post(c,root+"/pdf",new LabelPdfRequest{Paper=LabelPaperFixture(),Labels=[new(){Index=0,Png=LabelPng},new(){Index=15,Png=LabelPng},new(){Index=16,Png=LabelPng}]});Assert.True(pdf.StatusCode==HttpStatusCode.OK,await pdf.Content.ReadAsStringAsync());Assert.Equal("application/pdf",pdf.Content.Headers.ContentType!.MediaType);using(var doc=PdfReader.Open(new MemoryStream(await pdf.Content.ReadAsByteArrayAsync()),PdfDocumentOpenMode.Import)){Assert.Equal(2,doc.PageCount);Assert.InRange(doc.Pages[0].Width.Point,595.27,595.28);Assert.InRange(doc.Pages[0].Height.Point,841.88,841.9);var content=System.Text.Encoding.ASCII.GetString(doc.Pages[0].Contents.CreateSingleContent().Stream.UnfilteredValue);var placements=System.Text.RegularExpressions.Regex.Matches(content,@"q ([\d.-]+) 0 0 ([\d.-]+) ([\d.-]+) ([\d.-]+) cm /I\d+ Do Q");Assert.Equal(2,placements.Count);var expected=new[]{new[]{99.1,33.9,4.7,248.9},new[]{99.1,33.9,106.3,11.6}};for(var i=0;i<2;i++)for(var n=0;n<4;n++)Assert.InRange(double.Parse(placements[i].Groups[n+1].Value,System.Globalization.CultureInfo.InvariantCulture)*25.4/72,expected[i][n]-.001,expected[i][n]+.001);}
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockMovements.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());Assert.Equal("중량 상품",(await db.Products.SingleAsync(x=>x.Id==s.Bulk)).Name);var permissions=PermissionCatalog.Defaults();permissions["Employee"]["products"]=["menu","read"];db.Add(new TenantPermissionSettings{TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(permissions),UpdatedByUserId=t.Actor});await db.SaveChangesAsync();}
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(root)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root,LabelRequest())).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root+"/"+Id(duplicate),req)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root+"/"+Id(duplicate)+"/archive",new{version=Version(duplicate)})).StatusCode);
        using(var anonymous=f.Client())Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(root)).StatusCode);
    }
    [Theory]
    [InlineData("overflow")][InlineData("rotation")][InlineData("missing-image")][InlineData("external-image")][InlineData("barcode")][InlineData("offset")][InlineData("null-labels")][InlineData("null-image-key")][InlineData("duplicate")]
    public void InvalidLabelDocumentsCannotBeSaved(string invalid)
    {
        var r=LabelRequest();var d=r.Document;switch(invalid){case "overflow":d.Paper.Rows=100;break;case "rotation":d.Labels[0].Objects[0].Rotation=90;break;case "missing-image":d.Images.Clear();break;case "external-image":d.Images["logo"]="https://example.com/image.png";break;case "barcode":d.Labels[0].Objects[2].Text="한글";break;case "offset":d.OffsetX=11;break;case "null-labels":d.Labels=null!;break;case "null-image-key":d.Labels[0].Objects[1].ImageId=null!;break;case "duplicate":d.Labels[0].Objects[1].Id="text";break;}
        Assert.Throws<OrganizationException>(()=>LabelValidation.Document(d,"template"));
    }
    [Fact]
    public void LabelPdfRejectsOutOfPageCalibrationAndDuplicateSlots()
    {
        var r=new LabelPdfRequest{Paper=LabelPaperFixture(),OffsetX=-5,Labels=[new(){Index=0,Png=LabelPng}]};Assert.Throws<OrganizationException>(()=>LabelPdf.Create(r));r.OffsetX=0;r.Labels=[r.Labels[0],r.Labels[0]];Assert.Throws<OrganizationException>(()=>LabelPdf.Create(r));
    }
    [Fact]
    public void LabelBrowserRendersProduceExactPaperPdfs()
    {
        // Optional visual-review fixture from the real SVG/canvas renderer, never from a live tenant.
        var directory=Environment.GetEnvironmentVariable("LABEL_REVIEW_DIR");if(string.IsNullOrEmpty(directory))return;
        foreach(var file in Directory.GetFiles(directory,"*-job.json")){var request=JsonSerializer.Deserialize<LabelPdfRequest>(File.ReadAllText(file),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;var bytes=LabelPdf.Create(request);using var pdf=PdfReader.Open(new MemoryStream(bytes),PdfDocumentOpenMode.Import);Assert.Equal(request.Labels.Select(x=>x.Index/(request.Paper.Columns*request.Paper.Rows)).Distinct().Count(),pdf.PageCount);foreach(var page in pdf.Pages){Assert.InRange(page.Width.Point*25.4/72,request.Paper.Width-.01,request.Paper.Width+.01);Assert.InRange(page.Height.Point*25.4/72,request.Paper.Height-.01,request.Paper.Height+.01);}File.WriteAllBytes(file.Replace("-job.json",".pdf"),bytes);}
    }
}
