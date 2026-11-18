using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using IebleWms.Api.Partners;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class PartnerTests
{
    record Fixture(Guid Tenant,Guid Other,Guid Actor,string Password) {public string Root=>$"/api/tenants/{Tenant}/partners";}
    static async Task<Fixture> Seed(AuthFactory f)
    {
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var users=s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var a=new Tenant{Code="PRODUCT",Name="거래처 기업",BillingStatus=TenantBillingStatus.Paid};var b=new Tenant{Code="OTHER",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};
        var password="Test1!"+Guid.NewGuid().ToString("N");Guid actor=default;
        foreach(var (name,tenant,role) in new[]{("Master",a,TenantRole.Master),("Reader",a,TenantRole.Employee),("Other",b,TenantRole.Master)})
        {var u=new ApplicationUser{UserName=name,Email=name+"@partners.test",DisplayName=name};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.Add(new TenantMembership{Tenant=tenant,User=u,Role=role});if(name=="Master")actor=u.Id;}
        await db.SaveChangesAsync();return new(a.Id,b.Id,actor,password);
    }
    static async Task Login(HttpClient c,Fixture f,string user="Master")=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=user,password=f.Password})).StatusCode);
    static async Task<JsonElement> Post(HttpClient c,string path,object body,HttpStatusCode expected=HttpStatusCode.Created)
    {var r=await AuthTests.Post(c,path,body);Assert.True(r.StatusCode==expected,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
    static Guid Id(JsonElement p)=>p.GetProperty("id").GetGuid();
    static Guid Version(JsonElement p)=>p.GetProperty("version").GetGuid();
    static PartnerRequest Request(string code="P-01") => new() { RequestId=Guid.NewGuid(), Code=code, Name="거래처 "+code, Type="SUPPLIER" };
    static JsonElement Partner(JsonElement response)=>response.GetProperty("partner");

    [Fact]
    public async Task CrudStatusAndAuditKeepIdentityAndContacts()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request();r.BusinessRegistrationNumber="123-45-67890";r.RepresentativeName="대표";r.PostalCode="01234";r.Address="서울";r.AddressDetail="2층";
        r.Phone="+82 (2) 123-4567";r.Email="sales@example.com";r.ContactName="담당자";r.ContactPhone="+1 212-555-0100";r.PaymentTerms="익월 말";r.Notes="비고\n두 번째 줄";
        var p=Partner(await Post(c,t.Root,r));Assert.Equal(t.Actor,p.GetProperty("createdByUserId").GetGuid());
        var detail=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));
        foreach(var field in new[]{"businessRegistrationNumber","representativeName","postalCode","address","addressDetail","phone","email","contactName","contactPhone","paymentTerms","notes"})Assert.Equal(p.GetProperty(field).GetString(),detail.GetProperty(field).GetString());
        r.Code="CHANGED";r.Type="BOTH";r.Version=Version(p);r.Name="수정 거래처";var updated=Partner(await Post(c,t.Root+"/"+Id(p),r,HttpStatusCode.OK));
        Assert.Equal(Id(p),Id(updated));Assert.Equal("CHANGED",updated.GetProperty("code").GetString());Assert.Equal(p.GetProperty("createdAt").GetString(),updated.GetProperty("createdAt").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+Id(p),r)).StatusCode);
        var inactive=Partner(await Post(c,t.Root+"/"+Id(p)+"/status",new{version=Version(updated),isActive=false},HttpStatusCode.OK));Assert.False(inactive.GetProperty("isActive").GetBoolean());
        Assert.Equal(0,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?usage=receipt")).GetProperty("total").GetInt32());
        var active=Partner(await Post(c,t.Root+"/"+Id(p)+"/status",new{version=Version(inactive),isActive=true},HttpStatusCode.OK));Assert.True(active.GetProperty("isActive").GetBoolean());Assert.Equal(Id(p),Id(active));
        Assert.Equal(HttpStatusCode.MethodNotAllowed,(await c.DeleteAsync(t.Root+"/"+Id(p))).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var audits=await db.PartnerChanges.OrderBy(x=>x.Id).ToListAsync();Assert.Equal(4,audits.Count);Assert.All(audits,a=>Assert.Equal(t.Actor,a.ChangedByUserId));
        Assert.Equal("CHANGED",JsonSerializer.Deserialize<JsonElement>(audits[1].AfterJson).GetProperty("Code").GetString());
        audits[0].Action="Tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
    [Fact]
    public async Task CodesAreTenantUniqueBusinessNumbersWarnButAllowAndRetriesDoNotDuplicate()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request("Abc");r.BusinessRegistrationNumber="123-45-67890";var p=Partner(await Post(c,t.Root,r));
        Assert.Equal(Id(p),Id(Partner(await Post(c,t.Root,r))));r.Name="Changed replay";Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,r)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,Request(" abc "))).StatusCode);
        var other=Request("SECOND");other.BusinessRegistrationNumber="1234567890";var second=await Post(c,t.Root,other);Assert.Contains("같은 사업자등록번호",second.GetProperty("warning").GetString());
        var matches=await c.GetFromJsonAsync<JsonElement>(t.Root+"/business-number-check?number=123-45-67890&excludeId="+Id(p));Assert.Single(matches.GetProperty("matches").EnumerateArray());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.Partners.CountAsync());Assert.Equal(2,await db.PartnerChanges.CountAsync());}
        await Login(c,t,"Other");var root=$"/api/tenants/{t.Other}/partners";var foreign=Request("ABC");foreign.BusinessRegistrationNumber="123-45-67890";Assert.Equal(JsonValueKind.Null,(await Post(c,root,foreign)).GetProperty("warning").ValueKind);
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/"+Id(p))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,root+"/"+Id(p),Request())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,root+"/"+Id(p)+"/status",new{version=Version(p),isActive=false})).StatusCode);
        Assert.Single((await c.GetFromJsonAsync<JsonElement>(root+"/business-number-check?number=1234567890")).GetProperty("matches").EnumerateArray());
    }
    [Fact]
    public async Task ServerFiltersSearchAndPaginationCorrectAfterLastActiveRowDisappears()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);JsonElement last=default;
        for(var i=0;i<21;i++){var r=Request($"P-{i:D2}");r.Type=i%3==0?"BOTH":i%3==1?"SUPPLIER":"CUSTOMER";r.BusinessRegistrationNumber=$"12345{i:D5}";last=Partner(await Post(c,t.Root,r));}
        var page=await c.GetFromJsonAsync<JsonElement>(t.Root+"?page=2&status=active");Assert.Equal(21,page.GetProperty("total").GetInt32());Assert.Single(page.GetProperty("items").EnumerateArray());
        await Post(c,t.Root+"/"+Id(last)+"/status",new{version=Version(last),isActive=false},HttpStatusCode.OK);
        page=await c.GetFromJsonAsync<JsonElement>(t.Root+"?page=2&status=active");Assert.Equal(1,page.GetProperty("page").GetInt32());Assert.Equal(20,page.GetProperty("items").GetArrayLength());
        foreach(var search in new[]{"P-20","거래처 P-20","123-45-00020"})Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?search="+Uri.EscapeDataString(search))).GetProperty("total").GetInt32());
        Assert.Equal(7,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?type=BOTH")).GetProperty("total").GetInt32());
        Assert.Equal(14,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?usage=receipt")).GetProperty("total").GetInt32());
        Assert.Equal(13,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?usage=shipment")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(t.Root+"?pageSize=5000")).StatusCode);
    }
    [Fact]
    public async Task ReaderAndRevokedGrantsCannotMutateOrRead()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var p=Partner(await Post(c,t.Root,Request()));await Login(c,t,"Reader");
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(t.Root)).StatusCode);
        foreach(var (url,body) in new (string,object)[]{(t.Root,Request()),(t.Root+"/"+Id(p),Request()),(t.Root+"/"+Id(p)+"/status",new{version=Version(p),isActive=false})})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url,body)).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"]["partners"]=[];db.Add(new TenantPermissionSettings{TenantId=t.Tenant,UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid(),RolesJson=JsonSerializer.Serialize(roles)});await db.SaveChangesAsync();}
        foreach(var path in new[]{t.Root,t.Root+"/"+Id(p),t.Root+"/business-number-check?number=1234567890"})Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(path)).StatusCode);
    }
    [Theory]
    [InlineData("code")][InlineData("name")][InlineData("type")][InlineData("number")][InlineData("country")][InlineData("email")][InlineData("phone")][InlineData("contact")]
    public async Task InvalidInputDoesNotPersist(string field)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var r=Request();
        switch(field){case "code":r.Code="X"+new string('Y',64);break;case "name":r.Name=" ";break;case "type":r.Type="OTHER";break;case "number":r.BusinessRegistrationNumber="123-45";break;case "country":r.RegistrationCountry="INVALID";break;case "email":r.Email="not-email";break;case "phone":r.Phone="abc";break;case "contact":r.ContactPhone="+++";break;}
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,r)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Partners.ToListAsync());Assert.Empty(await db.PartnerChanges.ToListAsync());
    }
    [Fact]
    public async Task OverseasIdentifiersAndOptionalEmptyValuesAreAccepted()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var r=Request();r.RegistrationCountry="OTHER";r.BusinessRegistrationNumber="GB-AB123";r.Email="  ";r.Phone="+44 20 1234 5678";
        var p=Partner(await Post(c,t.Root,r));Assert.Equal("GB-AB123",p.GetProperty("businessRegistrationNumber").GetString());Assert.Equal(JsonValueKind.Null,p.GetProperty("email").ValueKind);
    }
    [Fact]
    public async Task BlankCodesUseTenantSequencePreserveEditsAndRollbackWithRegistration()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var blank=Request("");var first=Partner(await Post(c,t.Root,blank));Assert.Equal("BP01",first.GetProperty("code").GetString());
        Assert.Equal(Id(first),Id(Partner(await Post(c,t.Root,blank))));
        var invalid=Request(" ");invalid.Email="invalid";Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,invalid)).StatusCode);
        var second=Partner(await Post(c,t.Root,Request("   ")));Assert.Equal("BP02",second.GetProperty("code").GetString());
        var edit=Request("");edit.Name="수정";edit.Version=Version(first);
        var updated=Partner(await Post(c,t.Root+"/"+Id(first),edit,HttpStatusCode.OK));
        Assert.Equal(Id(first),Id(updated));Assert.Equal("BP01",updated.GetProperty("code").GetString());
        var manual=Request("BP99");manual.IsActive=false;var high=Partner(await Post(c,t.Root,manual));
        var renamed=Request("ABC-001");renamed.Version=Version(high);
        Assert.Equal("ABC-001",Partner(await Post(c,t.Root+"/"+Id(high),renamed,HttpStatusCode.OK)).GetProperty("code").GetString());
        Assert.Equal("BP100",Partner(await Post(c,t.Root,Request(""))).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,Request(" bp100 "))).StatusCode);
        await Login(c,t,"Other");
        Assert.Equal("BP01",Partner(await Post(c,$"/api/tenants/{t.Other}/partners",new {requestId=Guid.NewGuid(),name="생략 코드"})).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root,Request(""))).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(4,await db.Partners.CountAsync(x=>x.TenantId==t.Tenant));
        Assert.Equal(6,await db.PartnerChanges.CountAsync(x=>x.TenantId==t.Tenant));
    }
    [Fact]
    public async Task DatabaseConstraintRejectsDuplicateCodesAndDeletion()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await Post(c,t.Root,Request());
        using(var scope=f.Services.CreateScope()) {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.Partners.Add(new(){TenantId=t.Tenant,Code="p-01",NormalizedCode="P-01",Name="duplicate",CreationRequestId=Guid.NewGuid()});await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());}
        using(var scope=f.Services.CreateScope()) {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.Partners.Remove(await db.Partners.SingleAsync());await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());}
    }
}
