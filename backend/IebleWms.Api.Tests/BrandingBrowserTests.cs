using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class BrandingBrowserFactAttribute:FactAttribute
{
 public BrandingBrowserFactAttribute(){if(Environment.GetEnvironmentVariable("WMS_BRANDING_BROWSER")!="1")Skip="Opt-in isolated branding browser QA";}
}
public sealed partial class OrganizationTests
{
 [BrandingBrowserFact] public async Task BrandingAndCompanyLogoInActualAppWithIsolatedAuthentication()
 {
  using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
  var t=await Seed(f);
  var info=new ProcessStartInfo("node","tests/branding.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
  info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_BRANDING_UI_ORIGIN")??"http://127.0.0.1:5176";
  using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
  await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.TenantId,password=t.Password}));process.StandardInput.Close();
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
  Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
  using var final=f.Services.CreateScope();var context=final.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await context.CompanyLogos.ToListAsync());Assert.All(await context.Tenants.ToListAsync(),x=>Assert.Null(x.LogoVersion));
 }
}
