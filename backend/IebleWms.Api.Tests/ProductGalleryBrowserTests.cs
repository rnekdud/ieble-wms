using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class ProductGalleryBrowserFactAttribute : FactAttribute
{
    public ProductGalleryBrowserFactAttribute() { if (Environment.GetEnvironmentVariable("WMS_GALLERY_BROWSER") != "1") Skip = "Opt in: isolated SQLite API 5086 and headless frontend."; }
}
public sealed partial class ProductTests
{
    [ProductGalleryBrowserFact] public async Task GalleryControlsSaveReloadAndIsolationInRealBrowser()
    {
        using var f = new AuthFactory(); f.UseKestrel(5086);
        using var c = f.CreateClient(new() { BaseAddress = new Uri("http://localhost:5086"), AllowAutoRedirect = false });
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.True(db.Database.IsSqlite()); await db.Database.EnsureCreatedAsync(); }
        var t = await Seed(f); await Login(c,t);
        var request = Request("GALLERY-UI"); request.Images = [Upload("A.png"), Upload("B.png"), Upload("C.png")];
        var product = await Post(c,t.Root,request);
        var otherRequest = Request("KEEP-IMAGES"); otherRequest.Images = [Upload("unchanged.png")];
        var other = await Post(c,t.Root,otherRequest);
        var info = new ProcessStartInfo("node","tests/product-gallery.ui.mjs") { WorkingDirectory = Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory), RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        info.Environment["UI_ORIGIN"] = Environment.GetEnvironmentVariable("WMS_GALLERY_UI_ORIGIN") ?? "http://127.0.0.1:5176";
        using var process = Process.Start(info)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new { tenant=t.Tenant,password=t.Password,product=Id(product),images=product.GetProperty("images"),png=GalleryPng })); process.StandardInput.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(true); throw; }
        Assert.True(process.ExitCode==0,(await output)+"\n"+(await error)); Console.WriteLine(await output);
        var preserved = (await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(other))).GetProperty("product");
        Assert.Equal(Version(other),Version(preserved)); Assert.Equal(Id(other.GetProperty("images")[0]),Id(preserved.GetProperty("images")[0]));
    }
}
