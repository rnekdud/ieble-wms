using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Xml.Linq;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed partial class ProductTests
{
    static readonly XNamespace ImportNs="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static XDocument ImportXml(byte[] bytes,string path) { using var zip=new ZipArchive(new MemoryStream(bytes));using var stream=zip.GetEntry(path)!.Open();return XDocument.Load(stream); }
    static byte[] EditImport(byte[] bytes,Action<XDocument> edit)
    {
        using var stream=new MemoryStream();stream.Write(bytes);
        using(var zip=new ZipArchive(stream,ZipArchiveMode.Update,true)) {
            var entry=zip.GetEntry("xl/worksheets/sheet1.xml")!;XDocument sheet;using(var source=entry.Open())sheet=XDocument.Load(source);edit(sheet);
            entry.Delete();using var output=zip.CreateEntry("xl/worksheets/sheet1.xml").Open();sheet.Save(output);
        }
        return stream.ToArray();
    }
    static void AddImportRow(XDocument sheet,int row,string[] values)=>sheet.Descendants(ImportNs+"sheetData").Single().Add(new XElement(ImportNs+"row",new XAttribute("r",row),values.Select((value,col)=>new XElement(ImportNs+"c",new XAttribute("r",$"{(char)('A'+col)}{row}"),new XAttribute("t","inlineStr"),new XElement(ImportNs+"is",new XElement(ImportNs+"t",value))))));

    [Fact] public async Task StandardImportTemplateUsesTenantChoicesStylesAndThreeSheetsWithoutWriting()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        await Post(c,t.Root+"/categories",new{name="우리 기업 분류"},HttpStatusCode.OK);
        await Post(c,t.Root+"/types",new{name="우리 기업 구분"},HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.ProductTypes.Add(new(){TenantId=t.Other,Name="타기업 비밀 구분",NormalizedName="타기업 비밀 구분"});
            db.ProductCategories.Add(new(){TenantId=t.Other,Name="타기업 비밀 분류",NormalizedName="타기업 비밀 분류"});
            db.ProductTypes.Add(new(){TenantId=t.Tenant,Name="비활성 구분",NormalizedName="비활성 구분",IsActive=false});await db.SaveChangesAsync();
        }
        var response=await c.GetAsync(t.Root+"/import-template");Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.Contains("아이블WMS_상품대량등록_양식.xlsx",response.Content.Headers.ContentDisposition!.FileNameStar);
        var bytes=await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(new[]{"상품 등록","작성 안내","선택값 안내","카테고리 참조"},ImportXml(bytes,"xl/workbook.xml").Descendants(ImportNs+"sheet").Select(x=>(string)x.Attribute("name")!));
        var input=ImportXml(bytes,"xl/worksheets/sheet1.xml");Assert.Single(input.Descendants(ImportNs+"row"));
        Assert.Equal("상품명 (필수)",input.Descendants(ImportNs+"t").First().Value);Assert.DoesNotContain("기준 단위",input.ToString());
        Assert.Equal("A1:T501",(string?)input.Descendants(ImportNs+"autoFilter").Single().Attribute("ref"));
        Assert.Equal("frozen",(string?)input.Descendants(ImportNs+"pane").Single().Attribute("state"));
        Assert.Equal(1003,input.Descendants(ImportNs+"dataValidation").Count());
        Assert.All(input.Descendants(ImportNs+"col").Skip(15).Take(4),col=>Assert.Equal("3",(string?)col.Attribute("style")));
        var styles=ImportXml(bytes,"xl/styles.xml");Assert.Equal("49",(string?)styles.Descendants(ImportNs+"cellXfs").Single().Elements().ElementAt(3).Attribute("numFmtId"));
        var choices=ImportXml(bytes,"xl/worksheets/sheet3.xml").ToString();
        foreach(var value in new[]{"시스템 기본","기업 추가","우리 기업 분류","우리 기업 구분","식품·음료","완제품"})Assert.Contains(value,choices);
        foreach(var value in new[]{"타기업 비밀","비활성 구분"})Assert.DoesNotContain(value,choices);
        Assert.Contains("등록 대상 아님",ImportXml(bytes,"xl/worksheets/sheet2.xml").ToString());
        var errors=new List<ProductImportError>();Assert.Empty(ProductImportWorkbook.Read(Convert.ToBase64String(bytes),errors));Assert.Single(errors);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Products.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());}
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root+"/import-template")).StatusCode);
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root+"/import-template")).StatusCode);
    }

    [Fact] public async Task StandardImportDownloadedWorkbookRegistersTwoProductsWithAutomaticCodesAndEditableDetails()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var bytes=await c.GetByteArrayAsync(t.Root+"/import-template");
        var first=ImportRow("양식 상품 A","","00123456789012345678");first[2]="완제품";first[3]="식품·음료";first[4]="식품";first[5]="가공식품";first[8]="5,000";first[9]="3,000.50";first[10]="0";first[14]="20";first[19]="상온\n보관";
        var second=ImportRow("양식 상품 B","PR01","00000000000000000002");second[11]="";second[12]="12";second[13]="낱개";
        var request=new{requestId=Guid.NewGuid(),fileBase64=Convert.ToBase64String(EditImport(bytes,s=>{AddImportRow(s,2,first);AddImportRow(s,5,second);}))};
        var preview=await Post(c,t.Root+"/import-preview",request,HttpStatusCode.OK);Assert.Empty(preview.GetProperty("errors").EnumerateArray());Assert.Equal(2,preview.GetProperty("valid").GetInt32());
        Assert.True((await Post(c,t.Root+"/import",request,HttpStatusCode.OK)).GetProperty("committed").GetBoolean());
        Assert.True((await Post(c,t.Root+"/import",request,HttpStatusCode.OK)).GetProperty("committed").GetBoolean());
        Guid productId;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var products=await db.Products.OrderBy(x=>x.Name).ToListAsync();Assert.Equal(2,products.Count);var p=products[0];productId=p.Id;
            Assert.Equal("PR02",p.Code);Assert.Equal(3000.50m,p.CostPrice);Assert.Equal(5000m,p.RetailPrice);Assert.Equal(1000,ProductPackaging.Factor(p,"PALLET"));Assert.Equal(12,ProductPackaging.Factor(products[1],"OUTER"));
            Assert.Contains(await db.StorageBarcodes.Select(x=>x.Value).ToListAsync(),x=>x==first[17]);Assert.Empty(await db.StockBalances.ToListAsync());
        }
        var detail=(await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+productId)).GetProperty("product");Assert.Equal("양식 상품 A",detail.GetProperty("name").GetString());
        var update=Request(detail.GetProperty("code").GetString()!);update.Version=Version(detail);update.Name="대량등록 후 수정";update.InnerPackQuantity=10;update.OuterPackQuantity=5;update.PalletPackQuantity=20;update.Barcodes=null;update.Barcode=new(){Mode="keep"};
        Assert.Equal("대량등록 후 수정",(await Post(c,t.Root+"/"+productId,update,HttpStatusCode.OK)).GetProperty("name").GetString());
    }

    [Fact] public async Task StandardImportReportsPreciseFieldsAndCountsInvalidRowsOnce()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await Post(c,t.Root,Request("EXISTS","LABEL-EXISTS"));
        var bad=ImportRow("","EXISTS","LABEL-EXISTS");bad[2]="없는 구분";bad[3]="식품·음료";bad[4]="의류·패션";bad[8]="5원";bad[11]="0";bad[12]="1.5";bad[10]="1.5";bad[14]="-1";
        var result=await Post(c,t.Root+"/import",new{requestId=Guid.NewGuid(),fileBase64=await ImportFile((8,bad),(12,ImportRow("정상","GOOD","GOOD-BAR")))},HttpStatusCode.OK);
        Assert.False(result.GetProperty("committed").GetBoolean());Assert.Equal(2,result.GetProperty("total").GetInt32());Assert.Equal(1,result.GetProperty("valid").GetInt32());Assert.Equal(1,result.GetProperty("invalid").GetInt32());
        var errors=result.GetProperty("errors").EnumerateArray().ToArray();Assert.All(errors,e=>Assert.Equal(8,e.GetProperty("row").GetInt32()));
        foreach(var field in new[]{"상품명","상품코드","상품 구분","2차 카테고리","소비자가","안전재고","인박스 수량","아웃박스 수량","파레트당 아웃박스","아웃박스 바코드"})Assert.Contains(errors,e=>e.GetProperty("column").GetString()==field);
        using var scope=f.Services.CreateScope();Assert.Single(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Products.ToListAsync());
    }

    [Fact] public async Task StandardImportSupportsLegacyHeadersReorderingAndRejectsMalformedOrNumericBarcodes()
    {
        var bytes=Convert.FromBase64String(await ImportFile((7,ImportRow("이전 양식","LEGACY","00123456789"))));
        bytes=EditImport(bytes,s=>{
            s.Descendants(ImportNs+"t").First().Value="상품명";
            foreach(var row in s.Descendants(ImportNs+"row"))foreach(var cell in row.Elements(ImportNs+"c").Take(2)) { var address=(string)cell.Attribute("r")!;cell.SetAttributeValue("r",(address[0]=='A'?"B":"A")+address[1..]); }
        });
        var errors=new List<ProductImportError>();var rows=ProductImportWorkbook.Read(Convert.ToBase64String(bytes),errors);Assert.Empty(errors);Assert.Equal("이전 양식",rows.Single().Values[0]);
        var numeric=EditImport(bytes,s=>{var cell=s.Descendants(ImportNs+"c").Single(x=>(string?)x.Attribute("r")=="R7");cell.Attribute("t")!.Remove();cell.RemoveNodes();cell.Add(new XElement(ImportNs+"v","1.234567890123456E+19"));});
        errors.Clear();ProductImportWorkbook.Read(Convert.ToBase64String(numeric),errors);Assert.Contains(errors,e=>e.Row==7&&e.Column=="아웃박스 바코드"&&e.Message.Contains("텍스트"));
        var missing=EditImport(bytes,s=>s.Descendants(ImportNs+"row").First().Elements().First().Remove());
        errors.Clear();ProductImportWorkbook.Read(Convert.ToBase64String(missing),errors);Assert.Contains(errors,e=>e.Row==1&&e.Column=="상품명");
        errors.Clear();Assert.Empty(ProductImportWorkbook.Read(Convert.ToBase64String("not a zip"u8.ToArray()),errors));Assert.Contains(errors,e=>e.Column=="파일 구조");
    }
    [Fact] public async Task StandardImportRollsBackEarlierRowsWhenLaterSaveFails()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var requestId=Guid.NewGuid();
        var original=ImportRow("기존 요청","REPLAY","REPLAY-LABEL");
        var first=await Post(c,t.Root+"/import",new{requestId,fileBase64=await ImportFile((5,original))},HttpStatusCode.OK);Assert.True(first.GetProperty("committed").GetBoolean());
        original[0]="같은 요청의 변경된 내용";
        var changed=new{requestId,fileBase64=await ImportFile((2,ImportRow("롤백 대상","NEW","NEW-LABEL")),(5,original))};
        Assert.Empty((await Post(c,t.Root+"/import-preview",changed,HttpStatusCode.OK)).GetProperty("errors").EnumerateArray());
        var failed=await Post(c,t.Root+"/import",changed,HttpStatusCode.OK);Assert.False(failed.GetProperty("committed").GetBoolean());Assert.Equal(5,failed.GetProperty("errors")[0].GetProperty("row").GetInt32());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal("기존 요청",(await db.Products.SingleAsync()).Name);Assert.Single(await db.StorageBarcodes.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());
    }

}
