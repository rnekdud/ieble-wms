using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class OrganizationTests
{
    const string LogoPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    [Fact] public async Task CompanyLogoIsAtomicTenantPrivateVersionedAndRequiresExistingUpdatePermission()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,"Master@org.test",t.Password);
        var root=$"/api/tenants/{t.TenantId}/company";
        async Task<JsonElement> Company()=> (await c.GetFromJsonAsync<JsonElement>(root)).GetProperty("company");
        var company=await Company();
        object Request(object? logo)=>new{version=company.GetProperty("version").GetGuid(),name=company.GetProperty("name").GetString(),logo};
        var update=await AuthTests.Post(c,root,Request(new{fileName="logo.png",contentType="image/png",base64=LogoPng}));Assert.Equal(HttpStatusCode.OK,update.StatusCode);
        company=await Json(update);var version=company.GetProperty("logoVersion").GetGuid();
        Assert.DoesNotContain(LogoPng,await c.GetStringAsync(root));Assert.Equal(Convert.FromBase64String(LogoPng),await c.GetByteArrayAsync(root+"/logo"));
        var workspace=await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.TenantId}/workspace");Assert.Equal(version,workspace.GetProperty("logoVersion").GetGuid());
        var oldVersion=company.GetProperty("version").GetGuid();
        foreach(var bad in new[]{new{fileName="bad.svg",contentType="image/svg+xml",base64=Convert.ToBase64String("<svg/>"u8.ToArray())},new{fileName="fake.png",contentType="image/png",base64=Convert.ToBase64String(new byte[]{137,80,78,71,13,10,26,10,0,0,0,0})},new{fileName="logo.jpg",contentType="image/jpeg",base64=LogoPng},new{fileName="big.png",contentType="image/png",base64=Convert.ToBase64String(new byte[2*1024*1024+1])}})
        {Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root,Request(bad))).StatusCode);Assert.Equal(oldVersion,(await Company()).GetProperty("version").GetGuid());Assert.Equal(Convert.FromBase64String(LogoPng),await c.GetByteArrayAsync(root+"/logo"));}
        await Login(c,"Employee@org.test",t.Password);Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(root+"/logo")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root,Request(new{remove=true}))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.ForeignId}/company/logo")).StatusCode);
        using(var s=f.Services.CreateScope()){var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var employee=await db.TenantMemberships.SingleAsync(x=>x.UserId==t.Employee);var collaborator=new ExternalCollaborator{TenantId=t.TenantId,Name="협력사"};db.Add(collaborator);employee.AccountType="External";employee.CompanyName="협력사";employee.CollaboratorId=collaborator.Id;await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/logo")).StatusCode);
        await Login(c,"Administrator@org.test",t.Password);
        update=await AuthTests.Post(c,root,Request(new{fileName="changed.png",contentType="image/png",base64=LogoPng}));Assert.Equal(HttpStatusCode.OK,update.StatusCode);company=await Json(update);Assert.NotEqual(version,company.GetProperty("logoVersion").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root,new{version=oldVersion,name="stale",logo=new{remove=true}})).StatusCode);
        update=await AuthTests.Post(c,root,Request(new{remove=true}));Assert.Equal(HttpStatusCode.OK,update.StatusCode);Assert.Equal(JsonValueKind.Null,(await Json(update)).GetProperty("logoVersion").ValueKind);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/logo")).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await context.CompanyLogos.ToListAsync());Assert.Contains(await context.OrganizationChanges.ToListAsync(),x=>x.Action=="CompanyUpdated"&&x.AfterJson.Contains("LogoVersion"));
    }
}
