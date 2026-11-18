using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class ReceiptPlannedBrowserFactAttribute:FactAttribute
{
 public ReceiptPlannedBrowserFactAttribute(){if(Environment.GetEnvironmentVariable("WMS_RECEIPT_PLANNED_BROWSER")!="1")Skip="Opt-in isolated planned tracking browser QA";}
}
public sealed partial class ReceiptTests
{
 [ReceiptPlannedBrowserFact] public async Task PlannedTrackingRealBrowserPreservesHistoryAndOnlyFinalConfirmationCreatesStock()
 {
  using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
  var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);
  var info=new ProcessStartInfo("node","tests/receipt-planned.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
  info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_RECEIPT_UI_ORIGIN")??"http://127.0.0.1:5176";
  using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
  await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,product=s.Serial,partner=s.Partner,warehouse=s.Warehouse,location=s.Location}));process.StandardInput.Close();
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
  Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
  using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var stocks=await context.StockBalances.ToListAsync();Assert.Equal(100,stocks.Sum(x=>x.Quantity));Assert.DoesNotContain(stocks,x=>x.LotNumber=="PRE-A");Assert.Contains(await context.ReceiptChanges.ToListAsync(),x=>x.Action=="TrackingUpdated"&&x.BeforeJson.Contains("PRE-A")&&x.AfterJson.Contains("ACTUAL-A"));
 }
}
