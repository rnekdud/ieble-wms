using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

internal static class DocumentLanguageAssertions
{
    internal static void SameData(BusinessDocument ko, BusinessDocument en)
    {
        Assert.Equal(ko.Number,en.Number);Assert.Equal(ko.Issuer,en.Issuer);
        foreach(var field in ko.Information.Where(x=>!x.Label.EndsWith("상태")))Assert.Equal(field.Value,en.Information.Single(x=>x.Label==field.Label).Value);
        Assert.Equal(ko.Tables.Count,en.Tables.Count);
        for(var i=0;i<ko.Tables.Count;i++) {
            Assert.Equal(ko.Tables[i].Rows.Count,en.Tables[i].Rows.Count);
            for(var r=0;r<ko.Tables[i].Rows.Count;r++)for(var c=0;c<ko.Tables[i].Rows[r].Length;c++) {
                if(ko.Kind=="입고검수표"&&i==0&&c==6)Assert.Equal(en.Words.Text((string)ko.Tables[i].Rows[r][c]!),en.Tables[i].Rows[r][c]);
                else Assert.Equal(ko.Tables[i].Rows[r][c],en.Tables[i].Rows[r][c]);
            }
        }
        var layout=BusinessDocumentLayout.Create(en);
        var labels=layout.Information.SelectMany(r=>r.Cells.Where(c=>c.Style==DocumentCellStyle.Label)).Select(c=>c.Value!.ToString())
            .Concat(layout.Sections.Select(s=>s.Title)).Concat(layout.Sections.SelectMany(s=>s.Header!.Cells.Select(c=>c.Value!.ToString())))
            .Concat(layout.Signatures.Cells.Select(c=>c.Value!.ToString())).Append(layout.Title).Append(layout.NotesTitle).Append(layout.Notice);
        foreach(var label in labels.Where(x=>x!=null))Assert.DoesNotMatch("[가-힣]",label!);
        var korean=BusinessDocumentLayout.Create(ko);
        Assert.Equal(8,korean.Information[0].Cells[0].Span);Assert.Equal(22,korean.Information[0].Cells[1].Span);
        Assert.Equal(korean.Sections.Count,layout.Sections.Count);
    }
    internal static void Render(BusinessDocument doc,string suffix)
    {
        using var pdf=new MemoryStream();BusinessDocumentPdf.Write(pdf,doc,default);DocumentAssertions.Preview(pdf.ToArray(),doc.Kind+"-"+doc.Language+"-"+suffix+".pdf");
        using var excel=new MemoryStream();StockOverviewExport.WriteDocument(excel,doc,default);DocumentAssertions.Spreadsheet(excel.ToArray());DocumentAssertions.DataColumns(excel.ToArray(),doc);DocumentAssertions.Preview(excel.ToArray(),doc.Kind+"-"+doc.Language+"-"+suffix+".xlsx");
    }
}

public sealed partial class ReceiptTests
{
    [Fact]
    public async Task ReceiptDocumentLanguagePreservesBusinessTextAndQuantitiesAcrossPages()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var d=await Post(c,t.Root,Request(s));var id=Id(Doc(d));
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var receipt=await db.InboundReceipts.SingleAsync();receipt.PartnerName="미검수";receipt.WarehouseName="검수 완료";receipt.ContactName="정상";receipt.Notes="출고 미확정";
        var first=await db.InboundReceiptLines.SingleAsync();first.ProductName="가나디 무드등 가습기";first.ProductCode="0000123";first.LotNumber="LOT-미검수";first.Serials=["시리얼:정상"];first.ExpiryDate=new(2027,11,20);
        await db.SaveChangesAsync();var service=scope.ServiceProvider.GetRequiredService<BusinessDocumentService>();
        foreach(var count in new[]{1,5,25}) {
            var existing=await db.InboundReceiptLines.CountAsync();
            for(var n=existing;n<count;n++)db.InboundReceiptLines.Add(new(){TenantId=t.Tenant,ReceiptId=id,ProductId=first.ProductId,Position=n,ProductName="긴 상품명 가나디 무드등 가습기 "+n+" Original Product Description",ProductCode="000"+n,Unit=first.Unit,ExpectedQuantity=12.5m,InspectedQuantity=n%3==0?null:10m,LotNumber="LOT-"+n,ExpiryDate=new(2027,11,20)});
            await db.SaveChangesAsync();
            foreach(var kind in new[]{"statement","inspection"}) {
                var ko=await service.Receipt(t.Tenant,id,kind,default,"ko");var en=await service.Receipt(t.Tenant,id,kind,default,"en");DocumentLanguageAssertions.SameData(ko,en);
                Assert.Equal("미검수",en.Information.Single(x=>x.Label=="거래처").Value);Assert.Equal("출고 미확정",en.Information.Single(x=>x.Label=="비고").Value);
                Assert.Equal("가나디 무드등 가습기",en.Tables[0].Rows[0][kind=="inspection"?1:2]);
                Assert.Contains("시리얼:정상",string.Join(" ",en.Tables[1].Details.Values));
                if(kind=="inspection")Assert.Equal("Not Inspected",en.Tables[0].Rows[0][6]);
                DocumentLanguageAssertions.Render(ko,count.ToString());DocumentLanguageAssertions.Render(en,count.ToString());
            }
        }
        await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>service.Receipt(t.Tenant,id,"statement",default,"fr"));
        Assert.DoesNotContain(db.ChangeTracker.Entries(),e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
    }
}

public sealed partial class ShipmentTests
{
    [Fact]
    public async Task ShipmentDocumentLanguagePreservesAddressLocationOrderAndDraftPacking()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s,true);
        var request=OutRequest(s,2,true);request.ShippingAddress="출고 미확정";request.ShippingPostalCode="00001";request.ShippingAddressDetail="서울 납품처 2층";
        var d=await Post(c,Root(t),request);var id=Id(Shipment(d));
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var shipment=await db.OutboundShipments.SingleAsync();shipment.PartnerName="미검수";shipment.Notes="포장 내역 미확정 · 초안";
        var line=await db.OutboundShipmentLines.SingleAsync();line.ProductName="가나디 무드등 가습기";line.ProductCode="0000123";
        var allocations=await db.ShipmentAllocations.OrderBy(x=>x.Id).ToListAsync();
        allocations[0].LocationCode="위치 미지정";allocations[0].PickedQuantity=1;allocations[0].PickedAt=DateTimeOffset.UtcNow;
        allocations[1].LocationCode="검수 완료";
        await db.SaveChangesAsync();
        var service=scope.ServiceProvider.GetRequiredService<BusinessDocumentService>();
        foreach(var kind in new[]{"order","packing","picking"}) {
            var ko=await service.Shipment(t.Tenant,id,kind,default,"ko");var en=await service.Shipment(t.Tenant,id,kind,default,"en");DocumentLanguageAssertions.SameData(ko,en);
            Assert.Equal("00001 출고 미확정 서울 납품처 2층",en.Information.Single(x=>x.Label=="출고지").Value);
            Assert.Equal("포장 내역 미확정 · 초안",en.Information.Single(x=>x.Label=="비고").Value);
            if(kind=="packing")Assert.Contains("DRAFT — Packing Details Not Confirmed",BusinessDocumentLayout.Create(en).Notice);
            if(kind=="picking")Assert.Equal(1m,en.Tables[^1].Rows[0][2]);
            DocumentLanguageAssertions.Render(ko,"snapshot");DocumentLanguageAssertions.Render(en,"snapshot");
            // Exercise 1, 5 and 25 real-column rows in both document languages.
            foreach(var source in new[]{ko,en})foreach(var count in new[]{1,5,25}) {
                var tables=source.Tables.Select(t=>new DocumentTable(t.Title,t.Columns,t.Rows.Select(r=>(object?[])r.Clone()).ToList())).ToList();
                var main=tables[0];main.Rows.Clear();var original=source.Tables[0];
                for(var n=0;n<count;n++) {
                    var data=(object?[])original.Rows[n%original.Rows.Count].Clone();data[0]=n+1;main.Rows.Add(data);
                    if(original.Details.TryGetValue(n%original.Rows.Count,out var detail))main.Details[n]=detail;
                }
                var quantityColumn=kind=="picking"?3:4;
                tables[^1].Rows[0][1]=main.Rows.Sum(row=>(decimal?)row[quantityColumn]??0);
                if(kind=="picking")tables[^1].Rows[0][2]=main.Rows.Any(row=>row[4]!=null)?main.Rows.Sum(row=>(decimal?)row[4]??0):null;
                DocumentLanguageAssertions.Render(source with { Tables=tables },count.ToString());
            }
        }
        Assert.DoesNotContain(db.ChangeTracker.Entries(),e=>e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);
    }
}
