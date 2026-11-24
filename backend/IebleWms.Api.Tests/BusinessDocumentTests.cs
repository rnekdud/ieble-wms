using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using IebleWms.Api.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PdfSharp.Pdf.IO;
using Xunit;
namespace IebleWms.Api.Tests;

internal static class DocumentAssertions
{
    // Optional review output in a disposable directory; the caller removes it after visual QA.
    internal static void Preview(byte[] bytes,string name)
    {
        var directory=Environment.GetEnvironmentVariable("WMS_DOCUMENT_PREVIEW_DIRECTORY");
        if(directory!=null) { Directory.CreateDirectory(directory); File.WriteAllBytes(Path.Combine(directory,name),bytes); }
        var value=Environment.GetEnvironmentVariable("WMS_DOCUMENT_PREVIEW_URL");
        if(value==null)return;
        var uri=new Uri(value);Assert.True(uri.IsLoopback);
        using var client=new HttpClient();using var content=new ByteArrayContent(bytes);
        using var response=client.PostAsync(new Uri(uri,Uri.EscapeDataString(name)),content).GetAwaiter().GetResult();response.EnsureSuccessStatusCode();
    }
    internal static string Spreadsheet(byte[] bytes)
    {
        using var zip=new ZipArchive(new MemoryStream(bytes));Assert.NotNull(zip.GetEntry("xl/styles.xml"));
        var workbook=XDocument.Load(zip.GetEntry("xl/workbook.xml")!.Open());Assert.Contains("_xlnm.Print_Area",workbook.ToString());Assert.Contains("_xlnm.Print_Titles",workbook.ToString());
        XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var styles=XDocument.Load(zip.GetEntry("xl/styles.xml")!.Open());
        Assert.Equal("0",styles.Descendants(ns+"cellXfs").Single().Elements().First().Attribute("borderId")?.Value);
        Assert.Equal("0",styles.Descendants(ns+"cellStyleXfs").Single().Elements().First().Attribute("borderId")?.Value);
        var sheets=new XElement("workbook");int sheetIndex=0;
        foreach(var entry in zip.Entries.Where(e=>e.FullName.StartsWith("xl/worksheets/"))) {
            using var stream=entry.Open();var sheet=XDocument.Load(stream);
            Assert.Empty(sheet.Descendants(ns+"f"));
            var setup=sheet.Descendants(ns+"pageSetup").Single();
            Assert.Equal("9",setup.Attribute("paperSize")?.Value);Assert.Equal("portrait",setup.Attribute("orientation")?.Value);
            Assert.Equal("1",setup.Attribute("fitToWidth")?.Value);Assert.Equal("0",setup.Attribute("fitToHeight")?.Value);
            Assert.Equal("0",sheet.Descendants(ns+"sheetView").Single().Attribute("showGridLines")?.Value);
            Assert.Equal("0",sheet.Descendants(ns+"printOptions").Single().Attribute("gridLines")?.Value);
            var columns=sheet.Descendants(ns+"col").ToArray();Assert.InRange(columns.Length,2,7);
            Assert.All(columns,c=>{Assert.Null(c.Attribute("style"));Assert.Equal(c.Attribute("min")?.Value,c.Attribute("max")?.Value);});
            var lastColumn=((char)('A'+columns.Length-1)).ToString();
            var rows=sheet.Descendants(ns+"row").ToArray();var lastRow=(int)rows.Last().Attribute("r")!;
            Assert.Equal(rows.Length,lastRow);Assert.All(rows,r=>{Assert.Null(r.Attribute("s"));Assert.NotEmpty(r.Elements(ns+"c"));});
            Assert.Equal($"A1:{lastColumn}{lastRow}",sheet.Descendants(ns+"dimension").Single().Attribute("ref")?.Value);
            var area=workbook.Descendants(ns+"definedName").Single(x=>x.Attribute("name")?.Value=="_xlnm.Print_Area"&&x.Attribute("localSheetId")?.Value==sheetIndex.ToString());
            Assert.EndsWith($"!$A$1:${lastColumn}${lastRow}",area.Value);
            Assert.Contains(sheet.Descendants(ns+"mergeCell"),m=>m.Attribute("ref")?.Value==$"A1:{lastColumn}1");
            var header=rows.First(r=>r.Elements(ns+"c").Count()==columns.Length&&r.Elements(ns+"c").All(c=>c.Attribute("s")?.Value=="1"));
            var headerRow=(int)header.Attribute("r")!;
            Assert.DoesNotContain(sheet.Descendants(ns+"mergeCell"),m=>m.Attribute("ref")!.Value.Split(':').Any(a=>int.Parse(new string(a.Where(char.IsDigit).ToArray()))==headerRow));
            Assert.All(sheet.Descendants(ns+"c"),c=>Assert.InRange(c.Attribute("r")!.Value[0],'A',lastColumn[0]));
            sheets.Add(sheet.Root);sheetIndex++;
        }
        return sheets.ToString();
    }
    internal static void DataColumns(byte[] bytes,BusinessDocument doc)
    {
        using var zip=new ZipArchive(new MemoryStream(bytes));XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var tables=doc.Tables.Where(t=>t.Title!="합계").ToArray();
        for(var index=0;index<tables.Length;index++) {
            var table=tables[index];var sheet=XDocument.Load(zip.GetEntry($"xl/worksheets/sheet{index+1}.xml")!.Open());
            var data=sheet.Descendants(ns+"row").Where(r=>r.Elements(ns+"c").First().Element(ns+"v")!=null).ToArray();
            Assert.Equal(table.Rows.Count,data.Length);
            for(var row=0;row<data.Length;row++) {
                var cells=data[row].Elements(ns+"c").ToArray();Assert.Equal(table.Columns.Length,cells.Length);
                var rowNumber=data[row].Attribute("r")!.Value;
                Assert.DoesNotContain(sheet.Descendants(ns+"mergeCell"),m=>new string(m.Attribute("ref")!.Value.Split(':')[0].Where(char.IsDigit).ToArray())==rowNumber);
                for(var col=0;col<cells.Length;col++) {
                    var expected=table.Rows[row][col];var cell=cells[col];
                    if(expected is decimal or int or long)Assert.Equal(Convert.ToDecimal(expected),decimal.Parse(cell.Element(ns+"v")!.Value,System.Globalization.CultureInfo.InvariantCulture));
                    else if(expected is DateOnly date)Assert.Equal(date.ToDateTime(TimeOnly.MinValue).ToOADate(),double.Parse(cell.Element(ns+"v")!.Value,System.Globalization.CultureInfo.InvariantCulture));
                    else {Assert.Equal("inlineStr",cell.Attribute("t")?.Value);Assert.Equal(BusinessDocument.Text(expected),cell.Descendants(ns+"t").Single().Value);}
                }
            }
        }
    }
    internal static async Task Verify(HttpClient client,string url,string label)
    {
        string[]? koreanNumbers=null;
        foreach(var language in new[]{"ko","en"}) foreach(var format in new[]{"xlsx","pdf"}) {
            using var response=await client.GetAsync(url+"?format="+format+"&language="+language);
            Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());Assert.True(response.Headers.CacheControl?.NoStore);
            var words=new BusinessDocumentLanguage(language,label);
            var bytes=await response.Content.ReadAsByteArrayAsync();Assert.Contains(words.FileStem,response.Content.Headers.ContentDisposition?.FileNameStar);Assert.EndsWith("_"+language.ToUpperInvariant()+"."+format,response.Content.Headers.ContentDisposition?.FileNameStar);
            if(format=="xlsx") {
                var xml=Spreadsheet(bytes);
                Assert.Contains(language=="en"?"Item Description / Specification":"품명 / 규격",label=="출고피킹리스트"?xml.Replace("Item Code / Description","Item Description / Specification").Replace("상품코드 / 품명","품명 / 규격"):xml);
                XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
                // Compare typed values, ignoring row addresses that change when English wraps.
                var numbers=XDocument.Parse(xml).Descendants(ns+"v").Select(x=>x.Value).ToArray();
                if(language=="ko")koreanNumbers=numbers;else Assert.Equal(koreanNumbers,numbers);
            } else {
                Assert.StartsWith("%PDF-",Encoding.ASCII.GetString(bytes[..5]));
                using var pdf=PdfReader.Open(new MemoryStream(bytes),PdfDocumentOpenMode.Import);
                Assert.True(pdf.PageCount>0);Assert.All(pdf.Pages.Cast<PdfSharp.Pdf.PdfPage>(),p=>{Assert.InRange(p.Width.Point*25.4/72,209.99,210.01);Assert.InRange(p.Height.Point*25.4/72,296.99,297.01);});
                Assert.Contains(words.Text(label).Replace(" ",""),pdf.Info.Title.Replace(" ",""));
                Assert.Contains("/FontFile2",Encoding.Latin1.GetString(bytes));Assert.Contains("/ToUnicode",Encoding.Latin1.GetString(bytes));
            }
            Preview(bytes,label+"-"+language+"."+format);
        }
    }
}
public sealed partial class ReceiptTests
{
    [Fact]
    public async Task ReceiptDocumentsAreReadOnlyTenantScopedAndPreserveUninspectedAndLotQuantities()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var d=await Post(c,t.Root,Request(s));var id=Id(Doc(d));var path=$"{t.Root}/{id}/documents/";
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var l=await db.InboundReceiptLines.SingleAsync();l.ProductCode="00006";l.ProductName="=한글 상품 + English / " + new string('가',100);l.BarcodeSnapshotJson=JsonSerializer.Serialize(new[]{new ProductPackaging.ScanPackage(Guid.NewGuid(),"0008801234567890","EA",1)});await db.SaveChangesAsync();
            var service=scope.ServiceProvider.GetRequiredService<BusinessDocumentService>();var statement=await service.Receipt(t.Tenant,id,"statement",default);Assert.Null(statement.Tables[0].Rows[0][5]);
            var inspection=await service.Receipt(t.Tenant,id,"inspection",default);Assert.Null(inspection.Tables[0].Rows[0][5]);Assert.Equal("미검수",inspection.Tables[0].Rows[0][6]);Assert.DoesNotContain(db.ChangeTracker.Entries(),e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
        }
        var before=(await c.GetAsync(t.Root+"/"+id));var beforeJson=await before.Content.ReadAsStringAsync();
        await DocumentAssertions.Verify(c,path+"statement","입고명세서");await DocumentAssertions.Verify(c,path+"inspection","입고검수표");
        using var legacy=await c.GetAsync(path+"statement?format=xlsx");Assert.EndsWith("_KO.xlsx",legacy.Content.Headers.ContentDisposition?.FileNameStar);
        foreach(var language in new[]{"fr","EN","ko,en"})Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(path+"statement?language="+language)).StatusCode);
        var xlsx=DocumentAssertions.Spreadsheet(await legacy.Content.ReadAsByteArrayAsync());Assert.Contains("00006",xlsx);Assert.DoesNotContain("0008801234567890",xlsx);Assert.Contains("=한글 상품",xlsx);
        Assert.Equal(beforeJson,await c.GetStringAsync(t.Root+"/"+id));
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(path+"packing?format=xlsx")).StatusCode);Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(path+"statement?format=csv")).StatusCode);
        using var anonymous=f.Client();Assert.Equal(HttpStatusCode.Unauthorized,(await anonymous.GetAsync(path+"statement")).StatusCode);
        using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(path+"statement")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/tenants/{t.Other}/receipts/{id}/documents/statement")).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await context.StockBalances.ToListAsync());Assert.Empty(await context.StockMovements.ToListAsync());
    }
    [Fact]
    public async Task ReceiptDocumentTotalsDoNotDoubleCountTrackingRowsAndKeepUnitsSeparate()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await Ready(c,t,s,true);var id=Id(Doc(d));
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var line=await db.InboundReceiptLines.SingleAsync();line.TrackingAllocations=[new(){Id=Guid.NewGuid(),LotNumber="LOT-1",Quantity=1,ExpiryDate=new(2027,1,1),Serials=["SN-1"]},new(){Id=Guid.NewGuid(),LotNumber="LOT-2",Quantity=1,ExpiryDate=new(2027,2,1),Serials=["SN-2"]}];
        db.InboundReceiptLines.Add(new(){TenantId=t.Tenant,ReceiptId=id,ProductId=s.Bulk,ProductCode="KG",ProductName="Bulk",Unit="kg",Position=1,ExpectedQuantity=3,InspectedQuantity=null});await db.SaveChangesAsync();
        var doc=await scope.ServiceProvider.GetRequiredService<BusinessDocumentService>().Receipt(t.Tenant,id,"inspection",default);Assert.Equal(2,doc.Tables[1].Rows.Count);Assert.Equal(2,doc.Tables[^1].Rows.Count);Assert.Equal(2m,doc.Tables[^1].Rows.Single(x=>Equals(x[0],"EA"))[2]);Assert.Null(doc.Tables[^1].Rows.Single(x=>Equals(x[0],"kg"))[2]);Assert.Equal(0m,doc.Tables[0].Rows[0][5]);Assert.Null(doc.Tables[0].Rows[1][5]);
        using(var pdf=new MemoryStream()){BusinessDocumentPdf.Write(pdf,doc,default);DocumentAssertions.Preview(pdf.ToArray(),"여러LOT.pdf");}
        using(var excel=new MemoryStream()){StockOverviewExport.WriteDocument(excel,doc,default);DocumentAssertions.Preview(excel.ToArray(),"여러LOT.xlsx");}
    }
}
public sealed partial class ShipmentTests
{
    [Fact]
    public async Task ShipmentDocumentsPreserveAddressSnapshotsLocationOrderAndConfirmedQuantities()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);
        var request=OutRequest(s,2,true);request.ShippingPostalCode="01234";request.ShippingAddress="전표 저장 주소";request.ShippingAddressDetail="2층";
        var d=await Post(c,Root(t),request);var id=Id(Shipment(d));var path=$"{Root(t)}/{id}/documents/";
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var partner=await db.Partners.SingleAsync(x=>x.Id==s.Partner);partner.DefaultShippingAddress="새 기본 주소";await db.SaveChangesAsync();
            var service=scope.ServiceProvider.GetRequiredService<BusinessDocumentService>();var doc=await service.Shipment(t.Tenant,id,"packing",default);Assert.Contains("포장 내역 미확정",BusinessDocumentLayout.Create(doc).Notice);Assert.Equal(2m,doc.Tables[0].Rows[0][4]);Assert.Contains("전표 저장 주소",doc.Information.Single(x=>x.Label=="출고지").Value?.ToString());Assert.DoesNotContain("새 기본 주소",string.Join(" ",doc.Information));
            var picking=await service.Shipment(t.Tenant,id,"picking",default);Assert.Equal(d.GetProperty("allocations").GetArrayLength(),picking.Tables.Single(t=>t.Title=="피킹 작업 내역").Rows.Count);Assert.All(picking.Tables.Single(t=>t.Title=="피킹 작업 내역").Rows,row=>Assert.Null(row[4]));
        }
        var before=await c.GetStringAsync(Root(t)+"/"+id);
        foreach(var (kind,name) in new[]{("order","출고지시서"),("packing","출고패킹리스트"),("picking","출고피킹리스트")})await DocumentAssertions.Verify(c,path+kind,name);
        Assert.Equal(before,await c.GetStringAsync(Root(t)+"/"+id));
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(path+"order?language=fr")).StatusCode);
        using var legacy=await c.GetAsync(path+"order?format=pdf");Assert.EndsWith("_KO.pdf",legacy.Content.Headers.ContentDisposition?.FileNameStar);
        using var other=f.Client();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(path+"order")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/tenants/{t.Other}/shipments/{id}/documents/order")).StatusCode);
        d=await Action(c,t,d,"start-picking");d=await Work(c,t,d,"picking");d=await Work(c,t,d,"inspection");await Action(c,t,d,"confirm");
        using var verify=f.Services.CreateScope();var service2=verify.ServiceProvider.GetRequiredService<BusinessDocumentService>();var final=await service2.Shipment(t.Tenant,id,"packing",default);Assert.Equal(2m,final.Tables[0].Rows[0][4]);Assert.Equal(2m,final.Tables[^1].Rows[0][1]);Assert.Contains("포장 내역 미확정",BusinessDocumentLayout.Create(final).Notice);
    }
}
public sealed class BusinessDocumentRendererTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    [InlineData(25)]
    public void FivePracticalFormsRenderCompactTablesAndRepeatHeaders(int count)
    {
        foreach(var kind in new[]{"입고명세서","입고검수표","출고지시서","출고패킹리스트","출고피킹리스트"}) {
            bool inspection=kind=="입고검수표",picking=kind=="출고피킹리스트",packing=kind=="출고패킹리스트";
            var columns=inspection ? new DocumentColumn[]{new("번호",4),new("품명 / 규격",21),new("단위",5),new("예정수량",8),new("검수수량",8),new("차이",6),new("검수결과",8)}
                :picking ? [new("순서",4),new("보관위치",15),new("상품코드 / 품명",21),new("지시수량",8),new("피킹수량",8),new("확인",4)]
                :[new("번호",4),new("상품코드",10),new("품명 / 규격",23),new("단위",5),new("예정수량",9),new("입고수량",9)];
            var table=new DocumentTable(inspection?"검수 내역":picking?"피킹 작업 내역":"품목 내역",columns,[]);
            for(var i=0;i<count;i++) {
                var name=i==2?"국산 유기농 냉동 딸기 대용량 식자재 업소용 1kg 지퍼백 포장 제품":"냉동 메로나 "+(i+1);
                table.Rows.Add(inspection?[i+1,name,"EA",50m,i==0?null:45m,i==0?null:-5m,i==0?"미검수":"검수 완료"]
                    :picking?[i+1,"A-01 / "+(i+1).ToString("D2"),"0000"+i+"\n"+name,50m,i==0?20m:null,"□"]
                    :[i+1,"0000"+i,name,"EA",50m,null]);
                if(picking || i==1)table.Details[i]="단위: EA    LOT: LOT-20261120-"+i+"    유통기한: 2027-11-20";
            }
            var totals=new DocumentTable("합계",[new("단위",10),new("총 예정수량",25),new("총 처리수량",25)],[new object?[]{"EA",50m*count,inspection?45m*(count-1):picking?20m:null}]);
            var doc=new BusinessDocument(kind,kind,"IN0006",DateTimeOffset.UtcNow,"아이블 유통",[("작성일",new DateOnly(2026,11,20)),("거래처","가나다유통"),("창고","제1창고"),("입고 예정일",new DateOnly(2026,11,20)),("출고 예정일",new DateOnly(2026,11,20)),("담당자","홍길동"),("입고 상태","입고 예정"),("검수 상태","검수 중"),("피킹 상태","피킹 진행"),("출고 상태","출고 지시"),("출고지","01234 서울특별시 강남구 테헤란로 123 물류센터 2층"),("총 품목 수",count)],[table,totals],packing?["포장 내역 미확정 · 초안","출고 미확정"]:[]);
            var layout=BusinessDocumentLayout.Create(doc);
            Assert.InRange(layout.Sections[0].Header!.Cells.Length,5,7);
            Assert.All(layout.Information.Concat(layout.Sections.SelectMany(s=>s.Groups.SelectMany(g=>g.Rows))),r=>Assert.Equal(60,r.Cells.Sum(c=>c.Span)));
            using var pdf=new MemoryStream();BusinessDocumentPdf.Write(pdf,doc,default);pdf.Position=0;using var read=PdfReader.Open(pdf,PdfDocumentOpenMode.Import);
            Assert.All(read.Pages.Cast<PdfSharp.Pdf.PdfPage>(),p=>{Assert.InRange(p.Width.Point,595,596);Assert.InRange(p.Height.Point,841,843);});
            if(count==1)Assert.Equal(1,read.PageCount);if(count==25)Assert.True(read.PageCount>1);
            using var excel=new MemoryStream();StockOverviewExport.WriteDocument(excel,doc,default);DocumentAssertions.Spreadsheet(excel.ToArray());
            DocumentAssertions.Preview(pdf.ToArray(),kind+"-"+count+".pdf");DocumentAssertions.Preview(excel.ToArray(),kind+"-"+count+".xlsx");
        }
    }

    [Fact]
    public void EmptyLegacyDocumentProducesPrintableFilesWithoutInventedRows()
    {
        var doc=new BusinessDocument("statement","Empty / No records","OLD",DateTimeOffset.UtcNow,"Issuer",[("Missing",null)], [new("Products",[new("Code",1),new("Quantity",1)],[])],[]);
        using var pdf=new MemoryStream();BusinessDocumentPdf.Write(pdf,doc,default);pdf.Position=0;using var read=PdfReader.Open(pdf,PdfDocumentOpenMode.Import);Assert.Equal(1,read.PageCount);
        using var excel=new MemoryStream();StockOverviewExport.WriteDocument(excel,doc,default);Assert.Contains("등록된 내역 없음",DocumentAssertions.Spreadsheet(excel.ToArray()));
    }

    [Fact]
    public void LongUnicodeRowsPaginateWithEmbeddedKoreanFontAndNeverBecomeFormulas()
    {
        var rows=Enumerable.Range(0,100).Select(i=>new object?[]{"000"+i,"=상품명 " + new string('한',160),12.5m,new DateOnly(2027,1,1),string.Join("\n",Enumerable.Range(0,20).Select(n=>"SERIAL-"+n))}).ToList();
        var doc=new BusinessDocument("피킹리스트","긴 상품명 한글 English", "SO/001",DateTimeOffset.Parse("2026-11-20T00:00:00+09:00"),"테스트 기업",[],[new("목록",[new("상품코드",1),new("상품명",2),new("수량",1),new("유통기한",1),new("시리얼",2)],rows)],[]);
        using var pdf=new MemoryStream();BusinessDocumentPdf.Write(pdf,doc,default);pdf.Position=0;using var read=PdfReader.Open(pdf,PdfDocumentOpenMode.Import);Assert.True(read.PageCount>2);Assert.All(read.Pages.Cast<PdfSharp.Pdf.PdfPage>(),p=>Assert.True(p.Width.Point<p.Height.Point));
        using var excel=new MemoryStream();StockOverviewExport.WriteDocument(excel,doc,default);var xml=DocumentAssertions.Spreadsheet(excel.ToArray());Assert.Contains("inlineStr",xml);Assert.Contains("0000",xml);Assert.Contains("12.5",xml);Assert.DoesNotContain("<f>",xml);Assert.Equal("피킹리스트_SO_001_KO.pdf",doc.FileName("pdf"));
        DocumentAssertions.Preview(pdf.ToArray(),"long.pdf");DocumentAssertions.Preview(excel.ToArray(),"long.xlsx");
    }
}

public sealed partial class ShipmentTests
{
    [Fact]
    public async Task PickingDocumentSeparatesLocationsPartialWorkAndReleasedReservations()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);
        var d=await Post(c,Root(t),OutRequest(s,2,true));var id=Id(Shipment(d));
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var allocations=await db.ShipmentAllocations.OrderBy(x=>x.Id).ToListAsync();Assert.Equal(2,allocations.Count);
        allocations[0].LocationCode="A-01";allocations[0].PickedQuantity=1;allocations[0].PickedAt=DateTimeOffset.Parse("2026-11-20T01:00:00Z");
        allocations[1].LocationCode="B-02";
        await db.SaveChangesAsync();
        var service=scope.ServiceProvider.GetRequiredService<BusinessDocumentService>();
        var doc=await service.Shipment(t.Tenant,id,"picking",default);
        Assert.Equal(2,doc.Tables[0].Rows.Count);Assert.Equal("A-01",doc.Tables[0].Rows[0][1]);Assert.Equal("B-02",doc.Tables[0].Rows[1][1]);
        Assert.Equal(1m,doc.Tables[0].Rows[0][4]);Assert.Null(doc.Tables[0].Rows[1][4]);Assert.Equal(2m,doc.Tables[^1].Rows[0][1]);Assert.Equal(1m,doc.Tables[^1].Rows[0][2]);
        Assert.DoesNotContain(doc.Tables.SelectMany(x=>x.Columns),x=>x.Title.Contains("포장"));
        using(var pdf=new MemoryStream()){BusinessDocumentPdf.Write(pdf,doc,default);DocumentAssertions.Preview(pdf.ToArray(),"부분피킹.pdf");}
        using(var excel=new MemoryStream()){StockOverviewExport.WriteDocument(excel,doc,default);DocumentAssertions.Preview(excel.ToArray(),"부분피킹.xlsx");}
        allocations[1].State="Released";await db.SaveChangesAsync();
        var released=await service.Shipment(t.Tenant,id,"picking",default);
        Assert.DoesNotContain(released.Tables[0].Rows,row=>Equals(row[1],"B-02"));
        Assert.Equal(2m,released.Tables[0].Rows.Sum(row=>(decimal)row[3]!));
        Assert.Contains(released.Tables[0].Details.Values,x=>x.Contains("위치 미지정"));
        var order=await service.Shipment(t.Tenant,id,"order",default);
        Assert.Single(order.Tables[0].Rows);Assert.Equal(2m,order.Tables[0].Rows[0][4]);
        Assert.DoesNotContain(order.Tables.SelectMany(x=>x.Columns),x=>x.Title.Contains("피킹")||x.Title.Contains("보관위치"));
    }
}
