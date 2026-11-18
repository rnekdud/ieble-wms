using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class DirectExternalAccountBrowserFactAttribute:FactAttribute { public DirectExternalAccountBrowserFactAttribute(){if(Environment.GetEnvironmentVariable("WMS_DIRECT_EXTERNAL_BROWSER")!="1")Skip="Opt-in isolated account link UI QA";} }
public sealed class DirectExternalAccountBrowserTests
{
    [DirectExternalAccountBrowserFact] public async Task RealBrowserChecksDirectExternalRegistration()
    {
        using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);
        using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
        var t=await AccountLinkTests.Seed(f);
        var info=new ProcessStartInfo("node","tests/direct-external-account.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_DIRECT_EXTERNAL_UI_ORIGIN")??"http://127.0.0.1:5176";
        using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(t,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase}));process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);await process.WaitForExitAsync();throw new TimeoutException((await output)+"\n"+(await error));}
        Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await context.Tenants.CountAsync());Assert.Equal(5,await context.Users.CountAsync());
    }
}
