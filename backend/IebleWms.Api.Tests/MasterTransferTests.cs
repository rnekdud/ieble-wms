using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Contracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class MasterTransferTests
{
    private sealed record Fixture(Guid Tenant, Guid Foreign, Guid Owner, Guid Successor, Guid Administrator, string Password);
    private static async Task<Fixture> Seed(AuthFactory f)
    {
        using var init=f.Client();using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var t=new Tenant{Code="TRANSFER",Name="위임 기업",BillingStatus=TenantBillingStatus.Paid};var other=new Tenant{Code="FOREIGN",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};
        string password="master1!"+Guid.NewGuid().ToString("N");Guid owner=default,next=default,admin=default;
        foreach(var name in new[]{"owner","successor","admin","foreign"}) {
            var user=new ApplicationUser{UserName=name,Email=name+"@transfer.test",DisplayName=name};Assert.True((await users.CreateAsync(user,password)).Succeeded);
            db.Add(new TenantMembership{Tenant=name=="foreign"?other:t,User=user,Role=name is "owner" or "foreign"?TenantRole.Master:name=="admin"?TenantRole.Administrator:TenantRole.Employee});
            if(name=="owner")owner=user.Id;if(name=="successor")next=user.Id;if(name=="admin")admin=user.Id;
        }
        await db.SaveChangesAsync();return new(t.Id,other.Id,owner,next,admin,password);
    }
    private static string Url(Fixture f)=>$"/api/tenants/{f.Tenant}/users/master-transfer";
    private static async Task Login(HttpClient c,Fixture f,string name)=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=name,password=f.Password,rememberMe=true})).StatusCode);
    private static async Task<TransferMasterRequest> Request(HttpClient c,Fixture f)
    {
        var data=await c.GetFromJsonAsync<JsonElement>(Url(f));var target=data.GetProperty("candidates").EnumerateArray().Single(x=>x.GetProperty("userId").GetGuid()==f.Successor);
        var password = f.Password; // Generated only for the isolated fixture; never a stored credential.
        return new(){TargetUserId=f.Successor,CurrentMasterVersion=data.GetProperty("currentMasterVersion").GetGuid(),TargetVersion=target.GetProperty("version").GetGuid(),CurrentPassword=password,Reason="업무 담당 변경"};
    }
    [Fact]
    public async Task TransferIsAtomicAndBothPersistentSessionsImmediatelyUseNewRoles()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var owner=f.Client();using var next=f.Client();await Login(owner,t,"owner");await Login(next,t,"successor");
        Assert.Equal(HttpStatusCode.Forbidden,(await next.GetAsync($"/api/tenants/{t.Tenant}/permissions")).StatusCode);
        var request=await Request(owner,t);Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(owner,Url(t),request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await owner.GetAsync($"/api/tenants/{t.Tenant}/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await next.GetAsync($"/api/tenants/{t.Tenant}/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(owner,Url(t),request)).StatusCode);
        Assert.Equal("Administrator",(await owner.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/workspace")).GetProperty("role").GetString());
        Assert.Equal("Master",(await next.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/workspace")).GetProperty("role").GetString());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1,await db.TenantMemberships.CountAsync(x=>x.TenantId==t.Tenant&&x.IsActive&&x.Role==TenantRole.Master));
        var audit=await db.OrganizationChanges.SingleAsync(x=>x.Action=="MasterTransferred");Assert.Equal(t.Owner,audit.ChangedByUserId);Assert.Equal(t.Successor,audit.TargetUserId);Assert.Equal("업무 담당 변경",audit.Reason);Assert.Contains("Administrator",audit.AfterJson);Assert.DoesNotContain(t.Password,audit.BeforeJson+audit.AfterJson);
    }
    [Theory]
    [InlineData("wrongPassword",HttpStatusCode.BadRequest)]
    [InlineData("inactiveMembership",HttpStatusCode.BadRequest)]
    [InlineData("inactiveAccount",HttpStatusCode.BadRequest)]
    [InlineData("mustChange",HttpStatusCode.BadRequest)]
    [InlineData("foreign",HttpStatusCode.BadRequest)]
    [InlineData("self",HttpStatusCode.BadRequest)]
    [InlineData("stale",HttpStatusCode.Conflict)]
    public async Task InvalidTransfersPreserveBothRolesAndWriteNoTransferAudit(string mode,HttpStatusCode expected)
    {
        using var f=new AuthFactory();var t=await Seed(f);using var c=f.Client();await Login(c,t,"owner");var request=await Request(c,t);
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var member=await db.TenantMemberships.Include(x=>x.User).SingleAsync(x=>x.TenantId==t.Tenant&&x.UserId==t.Successor);
            switch(mode){case "wrongPassword":request.CurrentPassword="incorrect";break;case "inactiveMembership":member.IsActive=false;break;case "inactiveAccount":member.User.IsActive=false;break;case "mustChange":member.User.MustChangePassword=true;break;case "foreign":request.TargetUserId=(await db.TenantMemberships.SingleAsync(x=>x.TenantId==t.Foreign)).UserId;break;case "self":request.TargetUserId=t.Owner;break;case "stale":request.TargetVersion=Guid.NewGuid();break;}
            await db.SaveChangesAsync();
        }
        Assert.Equal(expected,(await AuthTests.Post(c,Url(t),request)).StatusCode);
        using var verify=f.Services.CreateScope();var db2=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(TenantRole.Master,(await db2.TenantMemberships.FindAsync(t.Tenant,t.Owner))!.Role);Assert.Equal(TenantRole.Employee,(await db2.TenantMemberships.FindAsync(t.Tenant,t.Successor))!.Role);Assert.False(await db2.OrganizationChanges.AnyAsync(x=>x.Action=="MasterTransferred"));
    }
    [Fact]
    public async Task TransferEndpointRequiresCurrentMasterSelectedTenantAndCsrf()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var owner=f.Client();using var admin=f.Client();await Login(owner,t,"owner");await Login(admin,t,"admin");var request=await Request(owner,t);
        Assert.Equal(HttpStatusCode.BadRequest,(await owner.PostAsJsonAsync(Url(t),request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await admin.GetAsync(Url(t))).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(admin,Url(t),request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(owner,$"/api/tenants/{t.Foreign}/users/master-transfer",request)).StatusCode);
    }
    [Fact]
    public async Task MasterAloneCanPromoteAndDemoteMultipleAdministratorsWithoutCreatingPositions()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var c=f.Client();using var admin=f.Client();await Login(c,t,"owner");await Login(admin,t,"admin");
        async Task<JsonElement> Member()=> (await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Tenant}/users")).GetProperty("items").EnumerateArray().Single(x=>x.GetProperty("userId").GetGuid()==t.Successor);
        var row=await Member();var path=$"/api/tenants/{t.Tenant}/users/{t.Successor}";
        var promote=new{name="successor",role="Administrator",isActive=true,version=row.GetProperty("version").GetGuid()};
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(admin,path,promote)).StatusCode);Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,path,promote)).StatusCode);
        row=await Member();Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,path,new{name="successor",role="Employee",isActive=true,version=row.GetProperty("version").GetGuid()})).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.JobPositions.ToListAsync());Assert.Equal(2,await db.OrganizationChanges.CountAsync(x=>x.TargetUserId==t.Successor&&x.Action=="EmployeeUpdated"));
    }
    [Fact]
    public async Task FailureDuringSecondWriteRollsBackDemotionAndPromotion()
    {
        using var f=new AuthFactory();var t=await Seed(f);using var c=f.Client();await Login(c,t,"owner");var request=await Request(c,t);
        using var scope=f.Services.CreateScope();var original=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var options=new DbContextOptionsBuilder<WmsDbContext>().UseSqlite(original.Database.GetDbConnection()).AddInterceptors(new FailTransferAudit()).Options;
        await using(var db=new WmsDbContext(options,new TestActor(),TimeProvider.System)) {
            var service=new MasterTransferService(db,scope.ServiceProvider.GetRequiredService<SignInManager<ApplicationUser>>(),new OrganizationAudit(db,TimeProvider.System));
            await Assert.ThrowsAsync<InvalidOperationException>(()=>service.Transfer(t.Tenant,t.Owner,request,default));
        }
        original.ChangeTracker.Clear();Assert.Equal(TenantRole.Master,(await original.TenantMemberships.FindAsync(t.Tenant,t.Owner))!.Role);Assert.Equal(TenantRole.Employee,(await original.TenantMemberships.FindAsync(t.Tenant,t.Successor))!.Role);Assert.False(await original.OrganizationChanges.AnyAsync(x=>x.Action=="MasterTransferred"));
    }
    private sealed class TestActor : IAuditActor { public Guid? UserId => null; }
    private sealed class FailTransferAudit:SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData e,InterceptionResult<int> r,CancellationToken ct=default)
        {if(e.Context!.ChangeTracker.Entries<OrganizationChange>().Any(x=>x.State==EntityState.Added&&x.Entity.Action=="MasterTransferred"))throw new InvalidOperationException("Simulated failure");return ValueTask.FromResult(r);}
    }
}
