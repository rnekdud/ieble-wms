using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class CompanyLogoBrowserFactAttribute : FactAttribute
{
    public CompanyLogoBrowserFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("WMS_COMPANY_LOGO_BROWSER") != "1")
            Skip = "Opt-in company logo cards with isolated SQLite and headless browser";
    }
}

public sealed partial class OrganizationTests
{
    [CompanyLogoBrowserFact]
    public async Task CompanyLogoCardsKeepDraftsLocalAndRefreshDesktopAndMobileHeaders()
    {
        using var factory = new AuthFactory(isolatedConnections: true);
        factory.UseKestrel(5086);
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("http://localhost:5086"), AllowAutoRedirect = false });
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            Assert.True(db.Database.IsSqlite());
            await db.Database.EnsureCreatedAsync();
        }
        var fixture = await Seed(factory);
        var info = new ProcessStartInfo("node", "tests/company-logo.ui.mjs")
        {
            WorkingDirectory = Path.GetFullPath("../../../../../frontend", AppContext.BaseDirectory),
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false
        };
        info.Environment["UI_ORIGIN"] = "http://127.0.0.1:5176";
        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new { tenant = fixture.TenantId, password = fixture.Password }));
        process.StandardInput.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch { process.Kill(true); throw; }
        Assert.True(process.ExitCode == 0, (await output) + "\n" + (await error));
        Console.WriteLine(await output);
        using var final = factory.Services.CreateScope();
        var context = final.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await context.CompanyLogos.ToListAsync());
        Assert.All(await context.Tenants.ToListAsync(), tenant => Assert.Null(tenant.LogoVersion));
    }
}
