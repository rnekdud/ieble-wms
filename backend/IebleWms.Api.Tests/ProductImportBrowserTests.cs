using System.Diagnostics;
using System.Net;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class ProductImportBrowserFactAttribute : FactAttribute
{
    public ProductImportBrowserFactAttribute() { if(Environment.GetEnvironmentVariable("WMS_IMPORT_BROWSER")!="1")Skip="Opt in with WMS_IMPORT_BROWSER=1 and an isolated frontend on 5176."; }
}
public sealed partial class ProductTests
{
    [ProductImportBrowserFact] public async Task RealExcelImportBrowserFlowUsesIsolatedSqlite()
    {
        using var f=new AuthFactory();f.UseKestrel(5086);
        using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();
        }
        var tenant=await Seed(f);await Login(c,tenant);
        await Post(c,tenant.Root,Request("EXISTS","BAR-EXISTS"));
        var catalog=await SeedImportCategories(f,tenant);
        static string[] Row(string name,string code="") { var r=Enumerable.Repeat("",20).ToArray();r[0]=name;r[1]=code;return r; }
        var missing=Row("","STRAWBERRY");var price=Row("바나나");price[8]="삼천원";var pack=Row("사과");pack[11]="-5";
        var three=await ImportFile((5,missing),(8,price),(12,pack));
        var duplicate=Row("중복 상품","EXISTS");duplicate[15]="BAR-EXISTS";
        var classification=Row("분류 오류");classification[2]="없는 구분";classification[3]="없는 카테고리";
        var relation=Row("2차 관계 오류");relation[3]="식품·음료";relation[4]="의류·패션";
        var third=Row("3차 관계 오류");third[3]="식품·음료";third[4]="식품";third[5]="운동화";
        var badNumbers=Row("숫자 오류");badNumbers[8]="-3";badNumbers[9]="문자";badNumbers[12]="ABC";badNumbers[14]="0";
        var sameA=Row("파일 중복 A","DUP");sameA[15]="SAME";var sameB=Row("파일 중복 B","DUP");sameB[15]="SAME";
        var validA=Row("정상 등록 A");validA[11]="10";validA[12]="5";validA[14]="20";validA[15]="00123456789012345678";
        var validB=Row("정상 등록 B");validB[15]="00123456789012345679";
        validA[3]=catalog[0].Name;validA[4]=catalog[2].Name;validA[5]=catalog[4].Name;
        validB[3]=catalog[1].Name;validB[4]=catalog[3].Name;validB[5]=catalog[5].Name;
        var orphan=CategoryImportRow("상위 미선택","",catalog[2].Name);
        var stale=CategoryImportRow("상위 변경 후 잘못된 하위",catalog[1].Name,catalog[3].Name,catalog[4].Name);
        var late=Row("등록 직전 충돌","LATE");late[15]="BAR-LATE";
        var bytes=await c.GetByteArrayAsync(tenant.Root+"/import-template");
        var missingHeader=Convert.ToBase64String(EditImport(bytes,s=>{s.Descendants(ImportNs+"row").First().Elements().First().Remove();AddImportRow(s,7,Row("헤더 누락"));}));
        var info=new ProcessStartInfo("node","tests/product-import-live.ui.mjs") { WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false };
        info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_IMPORT_UI_ORIGIN")??"http://127.0.0.1:5176";
        using var process=Process.Start(info)!;
        var stdout=process.StandardOutput.ReadToEndAsync();var stderr=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=tenant.Tenant,password=tenant.Password,categoryIds=new[]{catalog[4].Id,catalog[5].Id},files=new{three,dependent=Convert.ToBase64String(EditImport(bytes,s=>{AddImportRow(s,35,orphan);AddImportRow(s,38,stale);})),duplicate=await ImportFile((15,duplicate)),classification=await ImportFile((18,classification),(19,relation),(20,third)),numbers=await ImportFile((21,badNumbers)),many=await ImportFile(Enumerable.Range(2,40).Select(i=>(i,price)).ToArray()),limit=await ImportFile(Enumerable.Range(2,501).Select(i=>(i,Row("초과 상품"))).ToArray()),inFile=await ImportFile((23,sameA),(25,sameB)),missingHeader,valid=Convert.ToBase64String(EditImport(bytes,s=>{AddImportRow(s,2,validA);AddImportRow(s,4,validB);})),late=await ImportFile((30,late)),blank=Convert.ToBase64String(bytes)}}));
        process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
        Assert.True(process.ExitCode==0,(await stdout)+"\n"+(await stderr));
        Console.WriteLine(await stdout);
        using var finalScope=f.Services.CreateScope();var finalDb=finalScope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(4,await finalDb.Products.CountAsync());Assert.Empty(await finalDb.StockBalances.ToListAsync());
    }
}
