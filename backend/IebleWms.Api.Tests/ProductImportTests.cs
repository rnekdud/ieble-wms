using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Xml.Linq;
using IebleWms.Api.Data;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ProductTests
{
    static async Task<string> ImportFile(params (int Row,string[] Values)[] rows)
    {
        var template=await ProductImportWorkbook.Template(default);using var stream=new MemoryStream();stream.Write(template);
        using(var zip=new ZipArchive(stream,ZipArchiveMode.Update,true)){
            var entry=zip.GetEntry("xl/worksheets/sheet1.xml")!;XDocument sheet;using(var input=entry.Open())sheet=XDocument.Load(input);XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            foreach(var (index,values) in rows)sheet.Descendants(ns+"sheetData").Single().Add(new XElement(ns+"row",new XAttribute("r",index),values.Select((v,i)=>new XElement(ns+"c",new XAttribute("r",$"{(char)('A'+i)}{index}"),new XAttribute("t","inlineStr"),new XElement(ns+"is",new XElement(ns+"t",v))))));
            entry.Delete();using var output=zip.CreateEntry("xl/worksheets/sheet1.xml").Open();sheet.Save(output);
        }
        return Convert.ToBase64String(stream.ToArray());
    }
    static string[] ImportRow(string name,string code,string barcode){var row=Enumerable.Repeat("",20).ToArray();row[0]=name;row[1]=code;row[11]="10";row[12]="5";row[17]=barcode;return row;}
    [Fact] public async Task EaImportValidatesAllErrorsPreviewsWithoutWritingAndCommitsAtomicallyWithReplay()
    {using var f=new AuthFactory();using var c=f.Client();await EaImportScenario(f,c);}
    [ScanPostgresFact] public async Task PostgresEaImportAtomicReplay()
    {using var f=new ScanPostgresFactory();using var c=f.Client();await EaImportScenario(f,c);}
    static async Task EaImportScenario(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f,HttpClient c)
    {
        var t=await Seed(f);await Login(c,t);
        var file=await ImportFile((2,ImportRow("비쵸비","BIS","BIS-OUTER")),(4,ImportRow("초코바","CHOCO","CHOCO-OUTER")));
        var request=new{requestId=Guid.NewGuid(),fileBase64=file};
        var preview=await Post(c,t.Root+"/import-preview",request,HttpStatusCode.OK);Assert.Equal(0,preview.GetProperty("errors").GetArrayLength());Assert.Equal(4,preview.GetProperty("rows")[1].GetProperty("row").GetInt32());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Products.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());}
        var imported=await Post(c,t.Root+"/import",request,HttpStatusCode.OK);Assert.True(imported.GetProperty("committed").GetBoolean());
        Assert.True((await Post(c,t.Root+"/import",request,HttpStatusCode.OK)).GetProperty("committed").GetBoolean());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.Products.CountAsync());Assert.Empty(await db.StockBalances.ToListAsync());Assert.All(await db.Products.ToListAsync(),p=>{Assert.Equal("EA",p.Unit);Assert.Equal(50,ProductPackaging.Factor(p,"OUTER"));});Assert.All(await db.StorageBarcodes.ToListAsync(),b=>Assert.Equal("OUTER",b.PackageCode));}
        var invalid=ImportRow("","BIS","BIS-OUTER");invalid[11]="ABC";invalid[12]="-5";invalid[3]="없는 분류";
        var review=await Post(c,t.Root+"/import",new{requestId=Guid.NewGuid(),fileBase64=await ImportFile((8,invalid),(9,ImportRow("valid","OK","OK-OUTER")))},HttpStatusCode.OK);
        Assert.False(review.GetProperty("committed").GetBoolean());Assert.True(review.GetProperty("errors").GetArrayLength()>=5);Assert.All(review.GetProperty("errors").EnumerateArray(),e=>Assert.Equal(8,e.GetProperty("row").GetInt32()));
        using(var scope=f.Services.CreateScope()){Assert.Equal(2,await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Products.CountAsync());}
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root+"/import",request)).StatusCode);
    }
    [Fact] public async Task EaImportServerRechecksBarcodeConflictAndTemplateHasNoUnitColumn()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var bytes=await c.GetByteArrayAsync(t.Root+"/import-template");using(var zip=new ZipArchive(new MemoryStream(bytes))){Assert.NotNull(zip.GetEntry("xl/worksheets/sheet2.xml"));using var reader=new StreamReader(zip.GetEntry("xl/worksheets/sheet1.xml")!.Open());var text=await reader.ReadToEndAsync();Assert.DoesNotContain("기준 단위",text);Assert.Contains("인박스 수량",text);}
        var request=new{requestId=Guid.NewGuid(),fileBase64=await ImportFile((2,ImportRow("A","A","LATE")),(3,ImportRow("B","B","B-LABEL")))};
        Assert.Empty((await Post(c,t.Root+"/import-preview",request,HttpStatusCode.OK)).GetProperty("errors").EnumerateArray());
        await Post(c,t.Root,Request("OTHER","LATE"));
        var result=await Post(c,t.Root+"/import",request,HttpStatusCode.OK);Assert.False(result.GetProperty("committed").GetBoolean());
        using var scope=f.Services.CreateScope();Assert.Single(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Products.ToListAsync());
    }
}
