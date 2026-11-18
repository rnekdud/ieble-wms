using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class ActivityLogTests
{
    [Fact]
    public async Task ExistingAuditRecordsArePagedScopedAndReadOnlyWithSecretRedaction()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        Guid tenant, other; long otherId, firstId; const string password = "Activity-Test1!";
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var a = new Tenant { Name = "Activity A", Code="AUDITA", BillingStatus=TenantBillingStatus.Paid }; var b = new Tenant { Name = "Activity B", Code="AUDITB", BillingStatus=TenantBillingStatus.Paid }; db.AddRange(a,b); tenant=a.Id; other=b.Id;
            foreach(var (name, company, role) in new[] { ("audit-master", a, TenantRole.Master), ("audit-reader", a, TenantRole.Employee), ("audit-admin", a, TenantRole.Administrator), ("audit-other", b, TenantRole.Master) }) {
                var user = new ApplicationUser { UserName=name, Email=name+"@audit.test", DisplayName=name };
                Assert.True((await users.CreateAsync(user,password)).Succeeded); db.Add(new TenantMembership { Tenant=company, User=user, Role=role });
                if (name == "audit-master") {
                    for(var i=0;i<25;i++) db.OrganizationChanges.Add(new() { TenantId=tenant, ChangedByUserId=user.Id, ChangedAt=new DateTimeOffset(2026,11,9,15,0,0,TimeSpan.Zero).AddMinutes(i), Action="기업 정보 수정", BeforeJson="{\"Name\":\"Before\",\"PasswordHash\":\"HIDDEN\"}", AfterJson="{\"Name\":\"After\",\"nested\":{\"accessToken\":\"HIDDEN\"}}" });
                    db.ProductChanges.Add(new() {TenantId=tenant, TargetId=Guid.NewGuid(), ChangedByUserId=user.Id, ChangedAt=new DateTimeOffset(2026,11,10,15,0,0,TimeSpan.Zero), Action="상품 수정"});
                }
                if(name=="audit-other") db.OrganizationChanges.Add(new() {TenantId=other, ChangedByUserId=user.Id, ChangedAt=DateTimeOffset.UtcNow,Action="OTHER COMPANY SECRET"});
            }
            await db.SaveChangesAsync(); otherId=await db.OrganizationChanges.Where(x=>x.TenantId==other).Select(x=>x.Id).SingleAsync(); firstId=await db.OrganizationChanges.Where(x=>x.TenantId==tenant).Select(x=>x.Id).FirstAsync();
        }
        var root=$"/api/tenants/{tenant}/activity-log";
        async Task Login(string name) => Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(client,"/api/auth/login",new{email=name,password})).StatusCode);
        async Task<JsonElement> Read(string path) {var response=await client.GetAsync(path);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());return await response.Content.ReadFromJsonAsync<JsonElement>();}
        await Login("audit-master");
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync($"/api/tenants/{tenant}/pages/activity-log")).StatusCode);
        var list=await Read(root); Assert.Equal(26,list.GetProperty("total").GetInt32());Assert.Equal(20,list.GetProperty("items").GetArrayLength());Assert.DoesNotContain("HIDDEN",list.ToString());Assert.DoesNotContain("OTHER COMPANY",list.ToString());
        Assert.Equal(6,(await Read(root+"?page=2")).GetProperty("items").GetArrayLength());
        Assert.Equal(25,(await Read(root+"?source=organization&start=2026-11-10&end=2026-11-10&search=audit-master")).GetProperty("total").GetInt32());
        Assert.Equal(0,(await Read(root+"?end=2026-11-09")).GetProperty("total").GetInt32());
        Assert.Equal(1,(await Read(root+"?start=2026-11-11")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await client.GetAsync(root+"?start=2026-11-11&end=2026-11-10")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync(root+"/organization/"+otherId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync($"/api/tenants/{other}/activity-log")).StatusCode);
        var detail=await Read(root+"/organization/"+firstId);Assert.Contains("Before",detail.ToString());Assert.DoesNotContain("HIDDEN",detail.ToString());
        foreach(var user in new[]{"audit-reader","audit-admin","audit-other"}) { await Login(user);Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync($"/api/tenants/{tenant}/pages/activity-log")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync(root+"/organization/"+firstId)).StatusCode); }
        using(var scope=factory.Services.CreateScope()) {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(26,await db.OrganizationChanges.CountAsync());Assert.Contains("HIDDEN",(await db.OrganizationChanges.SingleAsync(x=>x.Id==firstId)).BeforeJson);}
    }
}
