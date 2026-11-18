using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class MasterEmailTests
{
    [Fact]
    public async Task MasterChangesOwnEmailWithDuplicateChecksAndSessionRefresh()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        var password = "Master1!" + Guid.NewGuid().ToString("N");
        Assert.Equal(HttpStatusCode.Created, (await AuthTests.Post(c, "/api/auth/register", new { loginId = "emailmaster", email = "before@email.test", companyName = "QA", businessRegistrationNumber = "1234567890", contactName = "마스터", contactPhone = "010-1234-5678", password })).StatusCode);
        Guid tenant, user; string hash, stamp;
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var m = await db.TenantMemberships.Include(x=>x.User).SingleAsync();tenant=m.TenantId;user=m.UserId;
            m.User.EmailConfirmed=true;hash=m.User.PasswordHash!;stamp=m.User.SecurityStamp!;
            db.Users.Add(new ApplicationUser { UserName="other",NormalizedUserName="OTHER",Email="taken@email.test",NormalizedEmail="TAKEN@EMAIL.TEST",DisplayName="Other" });
            await db.SaveChangesAsync();
        }
        var login = await AuthTests.Post(c, "/api/auth/login", new { email="emailmaster", password });Assert.Equal(HttpStatusCode.OK,login.StatusCode);
        var oldCookie=login.Headers.GetValues("Set-Cookie").Single(x=>x.StartsWith("ieble.session=")).Split(';')[0];
        var root=$"/api/tenants/{tenant}/users";var url=$"{root}/{user}/organization";
        async Task<JsonElement> Read() => (await c.GetFromJsonAsync<JsonElement>(root)).GetProperty("items")[0];
        var initial=await Read();var version=initial.GetProperty("version").GetGuid();
        foreach(var email in new string?[]{null,"","bad-email","a\nb@email.test"})
            Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url,new {version,email,contactPhone="010-9999-1111"})).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url,new {version,email="TAKEN@email.test",contactPhone="010-9999-1111"})).StatusCode);
        Assert.Equal("010-1234-5678",(await Read()).GetProperty("contactPhone").GetString());
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,url,new {version,email="after@email.test",contactPhone="010-5555-8888"})).StatusCode);
        var changed=await Read();Assert.Equal("after@email.test",changed.GetProperty("email").GetString());Assert.Equal("emailmaster",changed.GetProperty("loginId").GetString());
        Assert.NotEqual(version,changed.GetProperty("version").GetGuid());
        var me=await c.GetFromJsonAsync<JsonElement>("/api/auth/me");Assert.Equal(tenant,me.GetProperty("selectedTenantId").GetGuid());Assert.Equal("after@email.test",me.GetProperty("user").GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url,new {version,email="stale@email.test"})).StatusCode);
        using(var replay=f.CreateClient(new(){BaseAddress=new Uri("https://localhost"),HandleCookies=false,AllowAutoRedirect=false}))
        {replay.DefaultRequestHeaders.Add("Cookie",oldCookie);Assert.Equal(HttpStatusCode.Unauthorized,(await replay.GetAsync("/api/auth/me")).StatusCode);}
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var u=await db.Users.SingleAsync(x=>x.Id==user);
            Assert.Equal(hash,u.PasswordHash);Assert.NotEqual(stamp,u.SecurityStamp);Assert.False(u.EmailConfirmed);Assert.Equal("AFTER@EMAIL.TEST",u.NormalizedEmail);Assert.Equal("emailmaster",u.UserName);
            Assert.Equal(TenantRole.Master,(await db.TenantMemberships.SingleAsync()).Role);
            Assert.Equal("010-1234-5678",(await db.Tenants.SingleAsync()).ContactPhone);
            Assert.Equal("taken@email.test",(await db.Users.SingleAsync(x=>x.Id!=user)).Email);
            var audit=await db.OrganizationChanges.SingleAsync(x=>x.Action=="MemberOrganizationUpdated");Assert.Contains("before@email.test",audit.BeforeJson);Assert.Contains("after@email.test",audit.AfterJson);
        }
        await AuthTests.Post(c,"/api/auth/logout",new{});
        Assert.Equal(HttpStatusCode.Unauthorized,(await AuthTests.Post(c,"/api/auth/login",new{email="before@email.test",password})).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email="after@email.test",password})).StatusCode);
        await AuthTests.Post(c,"/api/auth/logout",new{});
        Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email="emailmaster",password})).StatusCode);
    }
}
