using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class UiIntegrationBrowserFactAttribute : FactAttribute
{
    public UiIntegrationBrowserFactAttribute() { if(Environment.GetEnvironmentVariable("WMS_UI_INTEGRATION_BROWSER")!="1") Skip="Opt-in isolated list UI integration QA"; }
}
public sealed partial class ReceiptTests
{
    [UiIntegrationBrowserFact]
    public async Task UiIntegrationRealBrowserChecksHeadersSearchAndStockGrouping()
    {
        using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);
        using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
        var t=await Seed(f);var s=await Setup(f,t);Guid reader;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.StockBalances.AddRange(new IebleWms.Api.Models.StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,ProductId=s.Bulk,Unit="kg",SourceKey="UI-BULK",Quantity=10,ReservedQuantity=2},new IebleWms.Api.Models.StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,ProductId=s.Serial,Unit="EA",SourceKey="UI-SERIAL",Quantity=3,ReservedQuantity=1});
            await db.SaveChangesAsync();
        }
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var master=await db.Users.SingleAsync(x=>x.Id==t.Actor);master.DisplayName="김철수";
            var other=await db.Users.SingleAsync(x=>x.UserName=="Reader");other.DisplayName="이영희";reader=other.Id;await db.SaveChangesAsync();
        }
        var info=new ProcessStartInfo("node","tests/ui-integration.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_UI_INTEGRATION_ORIGIN")??"http://127.0.0.1:5176";
        using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,actor=t.Actor,reader,product=s.Bulk,warehouse=s.Warehouse,partner=s.Partner}));process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(5));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
        Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.All(await context.ReceiptChanges.ToListAsync(),x=>Assert.Equal(t.Actor,x.ActorId));
    }
}
