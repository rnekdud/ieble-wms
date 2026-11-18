using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class DeploymentTests
{
    [Theory]
    [InlineData(null, "10.0.0.2", "http", "10.0.0.2")]
    [InlineData("10.0.0.2", "10.0.0.2", "https", "203.0.113.10")]
    [InlineData("10.0.0.2", "10.0.0.3", "http", "10.0.0.3")]
    public async Task ForwardedHeadersRequireExplicitTrustedPeer(string? proxy,string peer,string scheme,string client)
    {
        var config=new ConfigurationBuilder().AddInMemoryCollection(proxy==null?[]:new Dictionary<string,string?>{["Deployment:KnownProxies:0"]=proxy}).Build();
        using var host=await new HostBuilder().ConfigureWebHost(web=>web.UseTestServer().ConfigureServices(s=>s.AddWmsDeployment(config)).Configure(app=>{
            app.Use((context,next)=>{context.Connection.RemoteIpAddress=IPAddress.Parse(peer);return next(context);});
            app.UseForwardedHeaders();app.Run(context=>context.Response.WriteAsJsonAsync(new{scheme=context.Request.Scheme,client=context.Connection.RemoteIpAddress!.ToString()}));
        })).StartAsync();
        using var http=host.GetTestClient();http.DefaultRequestHeaders.Add("X-Forwarded-Proto","https");http.DefaultRequestHeaders.Add("X-Forwarded-For","203.0.113.10");
        var value=await http.GetFromJsonAsync<JsonElement>("/");Assert.Equal(scheme,value.GetProperty("scheme").GetString());Assert.Equal(client,value.GetProperty("client").GetString());
    }
    [Fact]
    public async Task ProductionHealthNeverExposesDatabaseOrConnectionErrors()
    {
        using var f=new AuthFactory(production:true);using var http=f.Client();
        var live=await http.GetAsync("/api/health/live");Assert.Equal(HttpStatusCode.OK,live.StatusCode);Assert.Contains("no-store",live.Headers.CacheControl!.ToString());Assert.Contains("DENY",live.Headers.GetValues("X-Frame-Options"));
        // The isolated SQLite factory has no PostgreSQL health connection: a failed dependency is 503, not fake success.
        var db=await http.GetAsync("/api/health/db");Assert.Equal(HttpStatusCode.ServiceUnavailable,db.StatusCode);Assert.Equal("{\"status\":\"unavailable\"}",await db.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound,(await http.GetAsync("/openapi/v1.json")).StatusCode);
        var foreign=new HttpRequestMessage(HttpMethod.Options,"/api/auth/login");foreign.Headers.Add("Origin","https://foreign.invalid");foreign.Headers.Add("Access-Control-Request-Method","POST");var preflight=await http.SendAsync(foreign);Assert.False(preflight.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
