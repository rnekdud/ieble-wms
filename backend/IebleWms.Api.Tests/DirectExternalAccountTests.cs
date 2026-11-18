using System.Net;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Microsoft.AspNetCore.Routing;
using static IebleWms.Api.Tests.AccountLinkTests;
namespace IebleWms.Api.Tests;
public sealed class DirectExternalAccountTests
{
    static void AssertRetired(HttpStatusCode status)=>Assert.Contains(status,new[]{HttpStatusCode.NotFound,HttpStatusCode.MethodNotAllowed});
    [Fact] public async Task RetiredApisCannotReadOrApproveHistoricalRequests()
    {
        using var f=new AuthFactory();using var init=f.Client();var t=await Seed(f);Guid id,version;
        using(var scope=f.Services.CreateScope()){
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var actor=await db.Users.SingleAsync(x=>x.UserName==t.OwnerB);
            var request=new ExternalAccountLink{TenantId=t.B,UserId=t.External,CollaboratorId=t.GroupB,RequestedByUserId=actor.Id,ExpiresAt=DateTimeOffset.UtcNow.AddDays(1)};
            db.ExternalAccountLinks.Add(request);await db.SaveChangesAsync();id=request.Id;version=request.Version;
        }
        using var manager=Client(f);using var owner=Client(f);await Login(manager,t.OwnerB,t.Password);await Login(owner,t.Login,t.Password);
        var root=Root(t.B)+"/users/account-links";
        AssertRetired((await manager.GetAsync(root)).StatusCode);
        AssertRetired((await Post(manager,root,new{loginId=t.Login,collaboratorId=t.GroupB})).StatusCode);
        AssertRetired((await Post(manager,root+"/"+id+"/decision",new{version,approve=true})).StatusCode);
        AssertRetired((await owner.GetAsync("/api/auth/company-links")).StatusCode);
        AssertRetired((await Post(owner,$"/api/auth/company-links/{id}/decision",new{version,approve=true})).StatusCode);
        Assert.DoesNotContain(f.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>(),e=>e.RoutePattern.RawText?.Contains("account-links")==true||e.RoutePattern.RawText?.Contains("company-links")==true);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var saved=await context.ExternalAccountLinks.SingleAsync();Assert.Equal("PendingOwner",saved.Status);Assert.Equal(version,saved.Version);Assert.False(await context.TenantMemberships.AnyAsync(x=>x.UserId==t.External&&x.TenantId==t.B));
    }
    [Fact] public async Task SeparateCompanyRegistrationsUseDistinctAccountsAndRespectCollaboratorCeilings()
    {
        using var f=new AuthFactory();using var init=f.Client();var t=await Seed(f);using var a=Client(f);using var b=Client(f);await Login(a,t.OwnerA,t.Password);await Login(b,t.OwnerB,t.Password);
        var prefix="partner-"+Guid.NewGuid().ToString("N")[..10];var ids=new List<Guid>();
        foreach(var (manager,tenant,group,login,allowed,foreign) in new[]{(a,t.A,t.GroupA,prefix+"_a","/products",t.B),(b,t.B,t.GroupB,prefix+"_b","/reports/stock-overview",t.A)}){
            var created=await Read(await Post(manager,Root(tenant)+"/users",new{name="협력사 직원",loginId=login,email=login+"@direct.test",accountType="External",collaboratorId=group,role="Employee"}),HttpStatusCode.Created);
            ids.Add(created.GetProperty("user").GetProperty("userId").GetGuid());
            using var employee=Client(f);await Login(employee,login,login);
            Assert.Equal(HttpStatusCode.Forbidden,(await employee.GetAsync(Root(tenant)+allowed)).StatusCode);
            await Read(await Post(employee,"/api/auth/change-password",new{currentPassword=login,newPassword=t.Password,confirmPassword=t.Password}));
            var session=await Read(await employee.GetAsync("/api/auth/me"));Assert.Equal(tenant,session.GetProperty("selectedTenantId").GetGuid());Assert.Single(session.GetProperty("memberships").EnumerateArray());
            Assert.Equal(HttpStatusCode.OK,(await employee.GetAsync(Root(tenant)+allowed)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await employee.GetAsync(Root(tenant)+"/users")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await employee.GetAsync(Root(foreign)+"/workspace")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await Post(employee,"/api/auth/select-tenant",new{tenantId=foreign})).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,(await employee.GetAsync("/api/admin/overview")).StatusCode);
        }
        Assert.NotEqual(ids[0],ids[1]);
        Assert.Equal(HttpStatusCode.Conflict,(await Post(b,Root(t.B)+"/users",new{name="중복",loginId=(prefix+"_a").ToUpperInvariant(),email=Guid.NewGuid()+"@direct.test",accountType="External",collaboratorId=t.GroupB,role="Employee"})).StatusCode);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();foreach(var id in ids)Assert.Equal(1,await context.TenantMemberships.CountAsync(x=>x.UserId==id));Assert.Empty(await context.ExternalAccountLinks.ToListAsync());
    }
    [Fact] public async Task ExistingMultipleMembershipsCanSwitchWithoutLinkWorkflow()
    {
        using var f=new AuthFactory();using var init=f.Client();var t=await Seed(f);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.TenantMemberships.Add(new(){TenantId=t.B,UserId=t.External,Role=TenantRole.Employee,AccountType="External",CollaboratorId=t.GroupB,CompanyName="ABC물류 B관계"});await db.SaveChangesAsync();}
        using var user=Client(f);await Login(user,t.Login,t.Password);
        Assert.Equal(JsonValueKind.Null,(await Read(await user.GetAsync("/api/auth/me"))).GetProperty("selectedTenantId").ValueKind);
        foreach(var tenant in new[]{t.A,t.B}){await Read(await Post(user,"/api/auth/select-tenant",new{tenantId=tenant}));Assert.Equal(tenant,(await Read(await user.GetAsync("/api/auth/me"))).GetProperty("selectedTenantId").GetGuid());}
        using var verify=f.Services.CreateScope();Assert.Equal(2,await verify.ServiceProvider.GetRequiredService<WmsDbContext>().TenantMemberships.CountAsync(x=>x.UserId==t.External));
    }
}
