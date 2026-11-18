using System.Net;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class SignupLoginIdTests
{
    internal static object Registration(string login,string password,string number)=>new{loginId=login,email=Guid.NewGuid()+"@signup.test",companyName="가입 QA",businessRegistrationNumber=number,contactName="담당자",contactPhone="010-1234-5678",password};
    static string Number()=>Random.Shared.NextInt64(1000000000,9999999999).ToString();
    [Fact] public async Task SignupAndMemberCreationReserveTheSameGlobalLoginNamespace()
    {
        using var f=new AuthFactory();using var init=f.Client();var t=await AccountLinkTests.Seed(f);using var guest=AccountLinkTests.Client(f);using var manager=AccountLinkTests.Client(f);await AccountLinkTests.Login(manager,t.OwnerB,t.Password);
        var check=await AccountLinkTests.Read(await AuthTests.Post(guest,"/api/auth/login-id-check",new{loginId=" "+t.Login.ToUpperInvariant()+" "}));Assert.False(check.GetProperty("available").GetBoolean());Assert.Equal(2,check.EnumerateObject().Count());
        var denied=await AccountLinkTests.Read(await AuthTests.Post(guest,"/api/auth/register",Registration(t.Login.ToUpperInvariant(),t.Password,Number())),HttpStatusCode.Conflict);Assert.Equal(LoginIdPolicy.DuplicateMessage,denied.GetProperty("message").GetString());Assert.Equal("duplicate_login_id",denied.GetProperty("code").GetString());
        var id="signup-"+Guid.NewGuid().ToString("N")[..12];await AccountLinkTests.Read(await AuthTests.Post(guest,"/api/auth/register",Registration(" "+id+" ",t.Password,Number())),HttpStatusCode.Created);
        var root=AccountLinkTests.Root(t.B)+"/users";
        Assert.False((await AccountLinkTests.Read(await AuthTests.Post(manager,root+"/login-id-check",new{loginId=id.ToUpperInvariant()}))).GetProperty("available").GetBoolean());
        foreach(var accountType in new[]{"Internal","External"}){
            var response=await AccountLinkTests.Read(await AuthTests.Post(manager,root,new{name="중복",loginId=id.ToUpperInvariant(),email=Guid.NewGuid()+"@signup.test",role="Employee",accountType,collaboratorId=accountType=="External"?(Guid?)t.GroupB:null}),HttpStatusCode.Conflict);Assert.Equal(LoginIdPolicy.DuplicateMessage,response.GetProperty("message").GetString());
        }
        await AccountLinkTests.Login(guest,id,t.Password);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1,await db.Users.CountAsync(x=>x.NormalizedUserName==id.ToUpperInvariant()));Assert.Equal(3,await db.Tenants.CountAsync());
        var user=await db.Users.SingleAsync(x=>x.UserName==id);user.IsActive=false;await db.SaveChangesAsync();
        using var anonymous=AccountLinkTests.Client(f);Assert.False((await AccountLinkTests.Read(await AuthTests.Post(anonymous,"/api/auth/login-id-check",new{loginId=id}))).GetProperty("available").GetBoolean());
    }
    [Fact] public async Task PublicAvailabilityRequiresCsrfValidInputAndRateLimit()
    {
        using var f=new AuthFactory();using var c=f.Client();
        Assert.Equal(HttpStatusCode.BadRequest,(await c.PostAsync("/api/auth/login-id-check",new StringContent("{}",System.Text.Encoding.UTF8,"application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,"/api/auth/login-id-check",new{loginId="!invalid"})).StatusCode);
        for(var i=0;i<13;i++)Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login-id-check",new{loginId="available-id"})).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests,(await AuthTests.Post(c,"/api/auth/login-id-check",new{loginId="available-id"})).StatusCode);
    }
    sealed class InsertBarrier(string login):SaveChangesInterceptor
    {
        readonly TaskCompletionSource ready=new(TaskCreationOptions.RunContinuationsAsynchronously);int arrivals;
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data,InterceptionResult<int> result,CancellationToken ct=default)
        {
            if(data.Context!.ChangeTracker.Entries<ApplicationUser>().Any(x=>x.State==EntityState.Added&&x.Entity.NormalizedUserName==login.ToUpperInvariant())){
                if(Interlocked.Increment(ref arrivals)==2)ready.TrySetResult();await ready.Task.WaitAsync(TimeSpan.FromSeconds(15),ct);
                if(data.Context.ChangeTracker.Entries<ApplicationUser>().Any(x=>x.State==EntityState.Added&&x.Entity.UserName==login))await Task.Delay(200,ct);
            }
            return result;
        }
    }
    [ScanPostgresFact] public async Task ConcurrentSignupAndMemberCreationReturnFriendlyUniqueIndexConflictWithoutPartialCompany()
    {
        using var f=new ScanPostgresFactory();using var init=f.Client();var t=await AccountLinkTests.Seed(f);var id="race-signup-"+Guid.NewGuid().ToString("N")[..12];var number=Number();
        var barrier=new InsertBarrier(id);using var app=f.WithWebHostBuilder(builder=>builder.ConfigureServices(services=>services.AddDbContext<WmsDbContext>(options=>options.AddInterceptors(barrier))));
        using var guest=AccountLinkTests.Client(app);using var manager=AccountLinkTests.Client(app);await AccountLinkTests.Login(manager,t.OwnerB,t.Password);
        var results=await Task.WhenAll(AuthTests.Post(guest,"/api/auth/register",Registration(id,t.Password,number)),AuthTests.Post(manager,AccountLinkTests.Root(t.B)+"/users",new{name="동시 등록",loginId=id.ToUpperInvariant(),email=Guid.NewGuid()+"@signup.test",role="Employee",accountType="Internal"}));
        Assert.Equal(HttpStatusCode.Conflict,results[0].StatusCode);Assert.Single(results,x=>x.StatusCode==HttpStatusCode.Created);var conflict=Assert.Single(results,x=>x.StatusCode==HttpStatusCode.Conflict);Assert.Equal(LoginIdPolicy.DuplicateMessage,(await AccountLinkTests.Read(conflict,HttpStatusCode.Conflict)).GetProperty("message").GetString());
        using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1,await db.Users.CountAsync(x=>x.NormalizedUserName==id.ToUpperInvariant()));Assert.Equal(results[0].StatusCode==HttpStatusCode.Created?1:0,await db.Tenants.CountAsync(x=>x.BusinessRegistrationNumber==number));
    }
}
