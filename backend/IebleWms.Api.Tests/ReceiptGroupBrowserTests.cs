using System.Diagnostics;
using System.Net;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class ReceiptGroupBrowserFactAttribute:FactAttribute
{
 public ReceiptGroupBrowserFactAttribute(){if(Environment.GetEnvironmentVariable("WMS_RECEIPT_GROUP_BROWSER")!="1")Skip="Opt-in isolated receipt browser QA";}
}
public sealed partial class ReceiptTests
{
 [ReceiptGroupBrowserFact] public async Task GroupInspectionRealHeadlessBrowserWithIsolatedSqlite()
 {
  using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
  var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);
  var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=30},new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=70});
  var info=new ProcessStartInfo("node","tests/receipt-groups.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
  info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_RECEIPT_UI_ORIGIN")??"http://127.0.0.1:5176";
  using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
  await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,receipt=Id(Doc(d)),product=s.Serial,warehouse=s.Warehouse,location=s.Location}));process.StandardInput.Close();
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
  Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
  using var final=f.Services.CreateScope();var context=final.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await context.StockBalances.ToListAsync();
  Assert.Equal(100,stock.Sum(x=>x.Quantity));Assert.Equal(60,stock.Where(x=>x.LotNumber=="LOT-A").Sum(x=>x.Quantity));Assert.Equal(40,stock.Where(x=>x.LotNumber=="LOT-B").Sum(x=>x.Quantity));Assert.Equal(3,stock.Count(x=>x.SerialNumber!=null));Assert.Equal(2,await context.InboundReceiptLines.CountAsync());
 }
}
