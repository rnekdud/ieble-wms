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
public sealed partial class ProductTests
{
    // Deliberately include display-name collisions with distinct stable IDs, as can occur across system/custom catalogs.
    static async Task<ProductCategory[]> SeedImportCategories(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f,Fixture fixture)
    {
        ProductCategory Category(string name,Guid tenant,ProductCategory? parent=null,bool active=true)=>new(){TenantId=tenant,Name=name,NormalizedName=Guid.NewGuid().ToString("N"),ParentId=parent?.Id,IsActive=active};
        var food=Category("식품 (기업)",fixture.Tenant);var electronics=Category("전자 제품 & 부품",fixture.Tenant);
        var snacks=Category("공통 / 분류 *?~",fixture.Tenant,food);var parts=Category(snacks.Name,fixture.Tenant,electronics);
        var chocolate=Category("초콜릿 [선물]",fixture.Tenant,snacks);var cable=Category("케이블 + 충전기",fixture.Tenant,parts);
        var inactive=Category("중지된 카테고리",fixture.Tenant,food,false);var hiddenChild=Category("중지 하위 비공개",fixture.Tenant,inactive);
        var duplicate1=Category("동일 형제 이름",fixture.Tenant,food);var duplicate2=Category(duplicate1.Name,fixture.Tenant,food);
        var foreign=Category("다른 기업 전용",fixture.Other);
        var all=new[]{food,electronics,snacks,parts,chocolate,cable,inactive,hiddenChild,duplicate1,duplicate2,foreign};
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.ProductCategories.AddRange(all);await db.SaveChangesAsync();return all;
    }
    static string[] CategoryImportRow(string name,params string[] categories)
    {
        var row=Enumerable.Repeat("",20).ToArray();row[0]=name;for(var i=0;i<categories.Length;i++)row[i+3]=categories[i];return row;
    }
    [Fact] public async Task DependentCategoryTemplateUsesSafeIdsHiddenReferencesAndIndependentRows()
    {
        using var f=new AuthFactory();using var c=f.Client();var fixture=await Seed(f);await Login(c,fixture);var categories=await SeedImportCategories(f,fixture);
        var bytes=await c.GetByteArrayAsync(fixture.Root+"/import-template");var book=ImportXml(bytes,"xl/workbook.xml");
        Assert.Equal("hidden",(string?)book.Descendants(ImportNs+"sheet").Single(s=>(string?)s.Attribute("name")=="카테고리 참조").Attribute("state"));
        Assert.Equal("auto",(string?)book.Descendants(ImportNs+"calcPr").Single().Attribute("calcMode"));
        var names=book.Descendants(ImportNs+"definedName").ToDictionary(x=>(string)x.Attribute("name")!,x=>x.Value);
        var refs=ImportXml(bytes,"xl/worksheets/sheet4.xml").Descendants(ImportNs+"c").ToDictionary(x=>(string)x.Attribute("r")!,x=>x);
        string TextAt(string address)=>refs.TryGetValue(address,out var cell)?string.Concat(cell.Descendants(ImportNs+"t").Select(x=>x.Value)):"";
        string[] Values(string name) {
            var range=names[name].Split('!')[1].Replace("$","").Split(':');var col=new string(range[0].TakeWhile(char.IsLetter).ToArray());var start=int.Parse(range[0][col.Length..]);var end=int.Parse(range[^1][col.Length..]);return Enumerable.Range(start,end-start+1).Select(row=>TextAt(col+row)).Where(x=>x!="").ToArray();
        }
        Assert.Contains(categories[0].Name,Values("WmsRootNames"));Assert.Contains("식품·음료",Values("WmsRootNames"));
        Assert.Equal(new[]{categories[2].Name},Values("WmsCat_"+categories[0].Id.ToString("N")));
        Assert.Equal(new[]{categories[3].Name},Values("WmsCat_"+categories[1].Id.ToString("N")));
        Assert.Equal(new[]{categories[4].Name},Values("WmsCat_"+categories[2].Id.ToString("N")));
        Assert.Equal(new[]{categories[5].Name},Values("WmsCat_"+categories[3].Id.ToString("N")));
        Assert.Empty(Values("WmsCategoryEmpty"));
        foreach(var name in names.Keys.Where(n=>n.StartsWith("WmsCat_")))Assert.Matches("^WmsCat_[a-f0-9]{32}$",name);
        var refsText=ImportXml(bytes,"xl/worksheets/sheet4.xml").ToString();
        foreach(var hidden in categories.Skip(6))Assert.DoesNotContain(hidden.Name,refsText);
        foreach(var row in new[]{2,3,501}) {
            var root=refs["H"+row].Element(ImportNs+"f")!.Value;var child=refs["I"+row].Element(ImportNs+"f")!.Value;
            Assert.Contains($"'상품 등록'!D{row}",root);Assert.Contains($"'상품 등록'!E{row}",child);Assert.Contains($"H{row}&\"|\"",child);
            Assert.Contains("\"*\",\"~*\"",root);Assert.Contains("\"?\",\"~?\"",child);Assert.Contains("WmsCategoryEmpty",root);
        }
        var input=ImportXml(bytes,"xl/worksheets/sheet1.xml");var rules=input.Descendants(ImportNs+"dataValidation").ToDictionary(x=>(string)x.Attribute("sqref")!,x=>x);
        Assert.Equal("WmsRootNames",rules["D2:D501"].Element(ImportNs+"formula1")!.Value);
        // Google Sheets ONE_OF_RANGE must receive an actual range, never an INDIRECT expression.
        // Inspect every row, including the final input row, rather than just formula text at row 2.
        foreach(var (column,level,key) in new[]{("E",2,"H"),("F",3,"I")}) {
            var usedCells=new HashSet<string>();
            for(var row=2;row<=501;row++) {
                var rule=rules[column+row];var name=rule.Element(ImportNs+"formula1")!.Value;
                Assert.Equal($"WmsOptions{level}_{row}",name);Assert.Equal("0",(string?)rule.Attribute("allowBlank"));
                var range=names[name].Split('!')[1].Replace("$","").Split(':');
                var col=range[0][0];var start=int.Parse(range[0][1..]);var end=int.Parse(range[1][1..]);
                Assert.True(end>=start);
                for(var r=start;r<=end;r++) {
                    Assert.True(usedCells.Add(col.ToString()+r));
                    var formula=refs[col.ToString()+r].Element(ImportNs+"f")!.Value;
                    Assert.Contains($"INDIRECT(${key}${row}),{r-start+1})",formula);
                    Assert.Contains("IFERROR",formula);
                }
            }
        }
        Assert.Equal(1003,rules.Count);Assert.Equal(3,input.Descendants(ImportNs+"conditionalFormatting").Count());
        Assert.Single(ImportXml(bytes,"xl/styles.xml").Descendants(ImportNs+"dxf"));
        Assert.Contains("자동 삭제하지 않습니다",ImportXml(bytes,"xl/worksheets/sheet2.xml").ToString());
        var path=Environment.GetEnvironmentVariable("WMS_CATEGORY_XLSX");if(!string.IsNullOrEmpty(path))await File.WriteAllBytesAsync(path,bytes);
    }
    [Fact] public async Task DependentCategoriesRejectChangedParentsMissingAncestorsAndCurrentCatalogConflicts()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var catalog=await SeedImportCategories(f,t);
        var bytes=await c.GetByteArrayAsync(t.Root+"/import-template");
        var badRows=new[]{
            (5,CategoryImportRow("잘못된 2차",catalog[0].Name,"식품")),
            (8,CategoryImportRow("상위 변경 후 3차",catalog[1].Name,catalog[3].Name,catalog[4].Name)),
            (12,CategoryImportRow("상위 없음","",catalog[2].Name)),
            (15,CategoryImportRow("중간 없음",catalog[0].Name,"",catalog[4].Name)),
            (18,CategoryImportRow("사용 중지",catalog[0].Name,catalog[6].Name)),
            (21,CategoryImportRow("타기업 분류",catalog[10].Name)),
            (24,CategoryImportRow("이름 모호",catalog[0].Name,catalog[8].Name))
        };
        var bad=Convert.ToBase64String(EditImport(bytes,s=>{foreach(var (row,values) in badRows)AddImportRow(s,row,values);}));
        var review=await Post(c,t.Root+"/import",new{requestId=Guid.NewGuid(),fileBase64=bad},HttpStatusCode.OK);
        Assert.False(review.GetProperty("committed").GetBoolean());Assert.Equal(7,review.GetProperty("errors").GetArrayLength());
        foreach(var (row,column,reason) in new[]{(5,"2차 카테고리","하위 분류"),(8,"3차 카테고리","하위 분류"),(12,"2차 카테고리","1차 카테고리를 먼저"),(15,"3차 카테고리","2차 카테고리를 먼저"),(18,"2차 카테고리","사용 중지"),(21,"1차 카테고리","현재 기업"),(24,"2차 카테고리","동일한 이름")}) {
            var error=review.GetProperty("errors").EnumerateArray().Single(e=>e.GetProperty("row").GetInt32()==row);Assert.Equal(column,error.GetProperty("column").GetString());Assert.Contains(reason,error.GetProperty("message").GetString());
        }
        var valid=Convert.ToBase64String(EditImport(bytes,s=>{AddImportRow(s,2,CategoryImportRow("식품 등록",catalog[0].Name,catalog[2].Name,catalog[4].Name));AddImportRow(s,3,CategoryImportRow("전자 등록",catalog[1].Name,catalog[3].Name,catalog[5].Name));}));
        var request=new{requestId=Guid.NewGuid(),fileBase64=valid};
        Assert.Empty((await Post(c,t.Root+"/import-preview",request,HttpStatusCode.OK)).GetProperty("errors").EnumerateArray());
        // The downloaded workbook is a snapshot: changes after download must be checked again on the server.
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var node=await db.ProductCategories.FindAsync(catalog[4].Id);node!.IsActive=false;await db.SaveChangesAsync();}
        review=await Post(c,t.Root+"/import",request,HttpStatusCode.OK);Assert.False(review.GetProperty("committed").GetBoolean());Assert.Equal("3차 카테고리",review.GetProperty("errors")[0].GetProperty("column").GetString());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Products.ToListAsync());var node=await db.ProductCategories.FindAsync(catalog[4].Id);node!.IsActive=true;await db.SaveChangesAsync();}
        Assert.True((await Post(c,t.Root+"/import",request,HttpStatusCode.OK)).GetProperty("committed").GetBoolean());
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var products=await db.Products.OrderBy(x=>x.Name).ToListAsync();Assert.Equal(2,products.Count);Assert.Empty(await db.StockBalances.ToListAsync());
            foreach(var product in products){var detail=(await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+product.Id)).GetProperty("product");Assert.Equal(product.Name=="식품 등록"?catalog[4].Id:catalog[5].Id,detail.GetProperty("categoryId").GetGuid());Assert.Equal("EA",detail.GetProperty("unit").GetString());}
        }
    }
}
