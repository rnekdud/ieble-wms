using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class AccountLinkTests
{
    internal sealed record Fixture(Guid A,Guid B,Guid GroupA,Guid GroupB,Guid External,string OwnerA,string OwnerB,string Login,string OtherLogin,string Password);
    internal static HttpClient Client(WebApplicationFactory<Program> f)=>f.CreateClient(new(){BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});
    internal static async Task<JsonElement> Read(HttpResponseMessage response,HttpStatusCode expected=HttpStatusCode.OK){var text=await response.Content.ReadAsStringAsync();Assert.True(response.StatusCode==expected,$"{response.StatusCode}: {text}");return JsonDocument.Parse(text).RootElement.Clone();}
    internal static Task<HttpResponseMessage> Post(HttpClient c,string url,object body)=>AuthTests.Post(c,url,body);
    internal static async Task Login(HttpClient c,string login,string password)=>await Read(await Post(c,"/api/auth/login",new{email=login,password}));
    internal static string Root(Guid t)=>$"/api/tenants/{t}";
    internal static async Task<Fixture> Seed(WebApplicationFactory<Program> f)
    {
        var suffix=Guid.NewGuid().ToString("N")[..12];var pw="Secure!Aa9"+suffix;
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await using var tx=await db.Database.BeginTransactionAsync();
        var a=new Tenant{Code="LINKA"+suffix.ToUpperInvariant(),Name="A기업",BillingStatus=TenantBillingStatus.Paid};var b=new Tenant{Code="LINKB"+suffix.ToUpperInvariant(),Name="B기업",BillingStatus=TenantBillingStatus.Paid};db.Tenants.AddRange(a,b);
        var pa=ExternalPermissionPolicy.Empty();pa["products"]=["menu","read"];pa["warehouses"]=["menu","read"];
        var pb=ExternalPermissionPolicy.Empty();pb["stock-overview"]=["menu","read"];
        var ga=new ExternalCollaborator{TenantId=a.Id,Name="ABC물류 A관계",PermissionsJson=JsonSerializer.Serialize(pa)};var gb=new ExternalCollaborator{TenantId=b.Id,Name="ABC물류 B관계",PermissionsJson=JsonSerializer.Serialize(pb)};db.ExternalCollaborators.AddRange(ga,gb);
        async Task<ApplicationUser> User(string prefix,Tenant tenant,bool external){var u=new ApplicationUser{UserName=prefix+suffix,Email=prefix+suffix+"@links.test",DisplayName=prefix};Assert.True((await users.CreateAsync(u,pw)).Succeeded);db.TenantMemberships.Add(new(){Tenant=tenant,User=u,IsDefault=true,Role=external?TenantRole.Employee:TenantRole.Master,AccountType=external?"External":"Internal",CollaboratorId=external?ga.Id:null,CompanyName=external?ga.Name:null});return u;}
        var ma=await User("owner-a-",a,false);var mb=await User("owner-b-",b,false);var external=await User("test01-",a,true);var other=await User("other-",a,true);await db.SaveChangesAsync();await tx.CommitAsync();
        return new(a.Id,b.Id,ga.Id,gb.Id,external.Id,ma.UserName!,mb.UserName!,external.UserName!,other.UserName!,pw);
    }
    [Fact] public async Task GlobalIdsAreNormalizedReservedAndProtectedFromEnumeration()
    {
        using var f=new AuthFactory();using var init=f.Client();var t=await Seed(f);using var a=Client(f);using var b=Client(f);using var user=Client(f);using var anonymous=Client(f);
        await Login(a,t.OwnerA,t.Password);await Login(b,t.OwnerB,t.Password);await Login(user,t.Login,t.Password);
        var login="new-id-"+Guid.NewGuid().ToString("N")[..10];
        object Request(string id,string email,string type="Internal")=>new{name="신규",loginId=id,email,role="Employee",accountType=type,collaboratorId=type=="External"?(Guid?)t.GroupB:null,companyName=type=="External"?"ABC물류":null};
        var created=await Read(await Post(a,Root(t.A)+"/users",Request(" "+login+" ",login+"@links.test")),HttpStatusCode.Created);
        Assert.Equal(login,created.GetProperty("user").GetProperty("loginId").GetString());
        foreach(var id in new[]{login,login.ToUpperInvariant()," "+login+" "}){
            var response=await Read(await Post(b,Root(t.B)+"/users",Request(id,Guid.NewGuid()+"@links.test","External")),HttpStatusCode.Conflict);
            Assert.Equal("이미 사용 중인 로그인 아이디입니다. 다른 아이디를 입력해 주세요.",response.GetProperty("message").GetString());
        }
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var u=await db.Users.SingleAsync(x=>x.UserName==login);u.IsActive=false;await db.SaveChangesAsync();}
        var check=Root(t.B)+"/users/login-id-check";
        Assert.False((await Read(await Post(b,check,new{loginId=login.ToUpperInvariant()}))).GetProperty("available").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized,(await Post(anonymous,check,new{loginId=login})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post(user,Root(t.A)+"/users/login-id-check",new{loginId=login})).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await Post(a,check,new{loginId=login})).StatusCode);
        var master=await Read(await Post(b,check,new{loginId=t.OwnerA}));Assert.False(master.GetProperty("available").GetBoolean());Assert.False(master.TryGetProperty("tenantId",out _));
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1,await context.Users.CountAsync(x=>x.NormalizedUserName==login.ToUpperInvariant()));
        Assert.True(context.Model.FindEntityType(typeof(ApplicationUser))!.GetIndexes().Single(x=>x.Properties.Count==1&&x.Properties[0].Name=="NormalizedUserName").IsUnique);
    }

    [ScanPostgresFact] public async Task PostgresConcurrentGlobalIdsStayUnique()
    {
        using var f=new ScanPostgresFactory();using var init=f.Client();var t=await Seed(f);using var a=Client(f);using var b=Client(f);using var b2=Client(f);
        await Login(a,t.OwnerA,t.Password);await Login(b,t.OwnerB,t.Password);await Login(b2,t.OwnerB,t.Password);
        var login="race-"+Guid.NewGuid().ToString("N")[..16];
        object Input(string id)=>new{name="동시 등록",loginId=id,email=Guid.NewGuid()+"@links.test",role="Employee",accountType="Internal"};
        var results=await Task.WhenAll(Post(a,Root(t.A)+"/users",Input(login)),Post(b,Root(t.B)+"/users",Input(login.ToUpperInvariant())));
        Assert.Single(results,x=>x.StatusCode==HttpStatusCode.Created);Assert.Single(results,x=>x.StatusCode==HttpStatusCode.Conflict);
        using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1,await db.Users.CountAsync(x=>x.NormalizedUserName==login.ToUpperInvariant()));
    }

}
