using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Billing;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class DevelopmentAccessTests
{
    sealed class Clock:TimeProvider {public DateTimeOffset Now=new(2026,10,30,5,0,0,TimeSpan.Zero);public override DateTimeOffset GetUtcNow()=>Now;}
    sealed record Local(bool IsLocal):ILocalDevelopmentEnvironment;
    sealed class Host:IDisposable
    {
        readonly AuthFactory original;public WebApplicationFactory<Program> App {get;}public Clock Clock {get;}=new();public HttpClient Client {get;}
        public Host(bool production=false,bool local=true)
        {
            original=new AuthFactory(production:production,clock:Clock,warehouseSetup:true);
            App=original.WithWebHostBuilder(b=>b.ConfigureServices(s=>s.AddSingleton<ILocalDevelopmentEnvironment>(new Local(local))));
            Client=App.CreateClient(new(){BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});
            using var scope=App.Services.CreateScope();scope.ServiceProvider.GetRequiredService<WmsDbContext>().Database.EnsureCreated();
        }
        public void Dispose(){Client.Dispose();App.Dispose();original.Dispose();}
    }
    record Fixture(Guid Tenant,Guid Other,string Code,string Password);
    static async Task<Fixture> Seed(Host h)
    {
        using var scope=h.App.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Tenant Tenant(string code)=>new(){Code=code,Name=code,BillingStatus=TenantBillingStatus.CardRequired,BillingPolicyVersion=2,TrialStartedAt=h.Clock.Now.AddMonths(-2),TrialEndsAt=h.Clock.Now.AddMonths(-1),FirstChargeAt=h.Clock.Now.AddMonths(-1),BillingAnchorDay=1};
        var target=Tenant("TARGET");var other=Tenant("OTHER");var password="Dev1!"+Guid.NewGuid().ToString("N");
        foreach(var (name,t,role) in new[]{("Master",target,TenantRole.Master),("Reader",target,TenantRole.Employee),("Manager",target,TenantRole.Administrator),("Other",other,TenantRole.Master)})
        {var u=new ApplicationUser{UserName=name,Email=name+"@dev-access.test",DisplayName=name};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.Add(new TenantMembership{Tenant=t,User=u,Role=role});}
        await db.SaveChangesAsync();return new(target.Id,other.Id,target.Code,password);
    }
    static async Task Login(Host h,Fixture f,string user="Master")=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(h.Client,"/api/auth/login",new{email=user,password=f.Password})).StatusCode);
    static async Task Grant(Host h,Fixture f)
    {using var s=h.App.Services.CreateScope();await s.ServiceProvider.GetRequiredService<DevelopmentAccessService>().Grant(f.Tenant,f.Code,h.Clock.Now,h.Clock.Now.AddDays(30),"개발 검증","tester@local");}
    static async Task<string> TenantSnapshot(Host h,Guid id)
    {using var s=h.App.Services.CreateScope();return JsonSerializer.Serialize(await s.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.AsNoTracking().SingleAsync(x=>x.Id==id));}

    [Fact]
    public async Task LocalGrantAllowsAllBusinessPagesButPreservesAuthenticationRolesAndRealFinancialState()
    {
        using var h=new Host();var f=await Seed(h);var root=$"/api/tenants/{f.Tenant}";var before=await TenantSnapshot(h,f.Tenant);
        Assert.Equal(HttpStatusCode.Unauthorized,(await h.Client.GetAsync(root+"/dashboard")).StatusCode);
        await Login(h,f);Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/products")).StatusCode);await Grant(h,f);
        foreach(var feature in PermissionCatalog.Features)
            Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+"/pages/"+feature.Key)).StatusCode);
        foreach(var page in new[]{"billing","permissions"})Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+"/pages/"+page)).StatusCode);
        foreach(var path in new[]{"/products","/warehouses","/dashboard"})Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+path)).StatusCode);
        var workspace=await h.Client.GetFromJsonAsync<JsonElement>(root+"/workspace");var access=workspace.GetProperty("billingAccess");
        Assert.Equal("CardRequired",workspace.GetProperty("billingStatus").GetString());Assert.Equal("DevelopmentTest",access.GetProperty("state").GetString());Assert.Equal("CardRequired",access.GetProperty("actualBillingState").GetString());Assert.False(access.GetProperty("hasRegisteredCard").GetBoolean());
        Assert.Equal(TimeSpan.FromDays(30),access.GetProperty("developmentTest").GetProperty("endsAt").GetDateTimeOffset()-access.GetProperty("developmentTest").GetProperty("startsAt").GetDateTimeOffset());
        var subscription=await h.Client.GetFromJsonAsync<JsonElement>(root+"/subscription");Assert.False(subscription.GetProperty("reminderVisible").GetBoolean());Assert.Empty(subscription.GetProperty("invoices").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(h.Client,root+"/development-access",new{})).StatusCode);
        await Login(h,f,"Reader");Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+"/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(h.Client,root+"/products",new{requestId=Guid.NewGuid(),code="P",name="Not allowed"})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/subscription")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync($"/api/tenants/{f.Other}/products")).StatusCode);
        await Login(h,f,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync($"/api/tenants/{f.Other}/products")).StatusCode);
        await Login(h,f,"Manager");Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+"/products")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/pages/permissions")).StatusCode);
        Assert.Equal(before,await TenantSnapshot(h,f.Tenant));using var verify=h.App.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Empty(await db.BillingInvoices.ToListAsync());Assert.Empty(await db.BillingChanges.ToListAsync());Assert.Empty(await db.BillingFeedbacks.ToListAsync());
        Assert.Single(await db.DevelopmentAccessGrants.ToListAsync());var audit=await db.DevelopmentAccessChanges.SingleAsync();Assert.Equal("Granted",audit.Action);Assert.Equal("tester@local",audit.Operator);
    }
    [Theory]
    [InlineData(true,true)][InlineData(false,false)]
    public async Task ProductionOrNonLocalServerIgnoresCopiedGrantsAndRejectsGrantAndRevoke(bool production,bool local)
    {
        using var h=new Host(production,local);var f=await Seed(h);await Login(h,f);var root=$"/api/tenants/{f.Tenant}";
        using(var scope=h.App.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.DevelopmentAccessGrants.Add(new(){TenantId=f.Tenant,StartsAt=h.Clock.Now.AddDays(-1),EndsAt=h.Clock.Now.AddDays(30),GrantedAt=h.Clock.Now,GrantedBy="copied",Reason="Copied development data"});await db.SaveChangesAsync();
            var service=scope.ServiceProvider.GetRequiredService<DevelopmentAccessService>();
            Assert.Equal(403,(await Assert.ThrowsAsync<OrganizationException>(()=>service.Grant(f.Tenant,f.Code,h.Clock.Now,h.Clock.Now.AddDays(30),"Test","tester"))).StatusCode);
            Assert.Equal(403,(await Assert.ThrowsAsync<OrganizationException>(()=>service.Revoke(f.Tenant,f.Code,"Test","tester"))).StatusCode);
        }
        var before=await TenantSnapshot(h,f.Tenant);
        foreach(var feature in PermissionCatalog.Features.Where(x=>x.Business))Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/pages/"+feature.Key)).StatusCode);
        var workspace=await h.Client.GetFromJsonAsync<JsonElement>(root+"/workspace");var access=workspace.GetProperty("billingAccess");Assert.Equal("CardRequired",access.GetProperty("state").GetString());Assert.False(access.GetProperty("canAccessWms").GetBoolean());Assert.False(access.TryGetProperty("developmentTest",out _));Assert.Equal(before,await TenantSnapshot(h,f.Tenant));
    }
    [Fact]
    public async Task ScheduledStartExactExpiryRevocationAndSuspensionAreEnforcedWithoutCaching()
    {
        using var h=new Host();var f=await Seed(h);await Login(h,f);var root=$"/api/tenants/{f.Tenant}";
        using(var scope=h.App.Services.CreateScope())await scope.ServiceProvider.GetRequiredService<DevelopmentAccessService>().Grant(f.Tenant,f.Code,h.Clock.Now.AddHours(1),h.Clock.Now.AddDays(30),"Scheduled","tester");
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/products")).StatusCode);
        await Grant(h,f);Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync(root+"/products")).StatusCode);
        using(var scope=h.App.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var grant=await db.DevelopmentAccessGrants.SingleAsync();grant.StartsAt=h.Clock.Now.AddDays(-30);grant.EndsAt=h.Clock.Now;await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/products")).StatusCode);
        await Grant(h,f);
        using(var scope=h.App.Services.CreateScope())await scope.ServiceProvider.GetRequiredService<DevelopmentAccessService>().Revoke(f.Tenant,f.Code,"End test","tester");
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/products")).StatusCode);
        await Grant(h,f);
        using(var scope=h.App.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var t=await db.Tenants.FindAsync(f.Tenant);t!.ServiceStatus=TenantServiceStatus.Suspended;await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync(root+"/products")).StatusCode);
        using(var scope=h.App.Services.CreateScope())
        {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var changes=await db.DevelopmentAccessChanges.ToListAsync();Assert.Contains(changes,x=>x.Action=="Revoked");changes[0].Reason="Tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());}
    }
    [Fact]
    public async Task ExistingCustomPermissionDenialsRemainEffectiveWithGrant()
    {
        using var h=new Host();var f=await Seed(h);await Grant(h,f);
        using(var scope=h.App.Services.CreateScope())
        {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"]["products"]=[];var actor=await db.Users.Where(x=>x.UserName=="Master").Select(x=>x.Id).SingleAsync();db.TenantPermissionSettings.Add(new(){TenantId=f.Tenant,RolesJson=JsonSerializer.Serialize(roles),Version=Guid.NewGuid(),UpdatedAt=h.Clock.Now,UpdatedByUserId=actor});await db.SaveChangesAsync();}
        await Login(h,f,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await h.Client.GetAsync($"/api/tenants/{f.Tenant}/products")).StatusCode);Assert.Equal(HttpStatusCode.OK,(await h.Client.GetAsync($"/api/tenants/{f.Tenant}/warehouses")).StatusCode);
    }
    [Fact]
    public async Task ExplicitTenantConfirmationAndFiniteValidPeriodAreRequired()
    {
        using var h=new Host();var f=await Seed(h);using var s=h.App.Services.CreateScope();var service=s.ServiceProvider.GetRequiredService<DevelopmentAccessService>();
        foreach(var (id,code,start,end) in new[]{(f.Tenant,"WRONG",h.Clock.Now,h.Clock.Now.AddDays(30)),(Guid.NewGuid(),f.Code,h.Clock.Now,h.Clock.Now.AddDays(30)),(f.Tenant,f.Code,h.Clock.Now,h.Clock.Now),(f.Tenant,f.Code,h.Clock.Now.AddDays(-2),h.Clock.Now.AddDays(-1))})
            await Assert.ThrowsAsync<OrganizationException>(()=>service.Grant(id,code,start,end,"Test","tester"));
        var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.DevelopmentAccessGrants.ToListAsync());Assert.Empty(await db.DevelopmentAccessChanges.ToListAsync());
    }
    sealed class EnvironmentStub(string name):IHostEnvironment
    {public string EnvironmentName {get;set;}=name;public string ApplicationName {get;set;}="test";public string ContentRootPath {get;set;}="/tmp";public IFileProvider ContentRootFileProvider {get;set;}=new NullFileProvider();}
    [Theory]
    [InlineData("Development","127.0.0.1",5435,"ieble_wms_dev",true)]
    [InlineData("Development","localhost",5435,"ieble_wms_dev",true)]
    [InlineData("Production","localhost",5435,"ieble_wms_dev",false)]
    [InlineData("Staging","localhost",5435,"ieble_wms_dev",false)]
    [InlineData("Development","remote.example",5435,"ieble_wms_dev",false)]
    [InlineData("Development","localhost",5432,"ieble_wms_dev",false)]
    [InlineData("Development","localhost",5435,"production",false)]
    public void OnlyExplicitLocalDevelopmentConnectionIsEligible(string env,string host,int port,string database,bool allowed)
    {
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"ConnectionStrings:DefaultConnection",$"Host={host};Port={port};Database={database}"}}).Build();
        Assert.Equal(allowed,new LocalDevelopmentEnvironment(new EnvironmentStub(env),config).IsLocal);
    }
}
