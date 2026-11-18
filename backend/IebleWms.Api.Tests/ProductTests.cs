using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using IebleWms.Api.Products;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ProductTests
{
    record Fixture(Guid Tenant,Guid Other,Guid Actor,string Password) {public string Root=>$"/api/tenants/{Tenant}/products";}
    static async Task<Fixture> Seed(Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> f)
    {
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var users=s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var a=new Tenant{Code="PRODUCT",Name="상품 기업",BillingStatus=TenantBillingStatus.Paid};var b=new Tenant{Code="OTHER",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};
        var password="Test1!"+Guid.NewGuid().ToString("N");Guid actor=default;
        foreach(var (name,tenant,role) in new[]{("Master",a,TenantRole.Master),("Reader",a,TenantRole.Employee),("Other",b,TenantRole.Master)})
        {var u=new ApplicationUser{UserName=name,Email=name+"@products.test",DisplayName=name};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.Add(new TenantMembership{Tenant=tenant,User=u,Role=role});if(name=="Master")actor=u.Id;}
        await db.SaveChangesAsync();return new(a.Id,b.Id,actor,password);
    }
    static async Task Login(HttpClient c,Fixture f,string user="Master")=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=user,password=f.Password})).StatusCode);
    static async Task<JsonElement> Post(HttpClient c,string path,object body,HttpStatusCode expected=HttpStatusCode.Created)
    {var r=await AuthTests.Post(c,path,body);Assert.True(r.StatusCode==expected,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
    static Guid Id(JsonElement p)=>p.GetProperty("id").GetGuid();
    static Guid Version(JsonElement p)=>p.GetProperty("version").GetGuid();
    static ProductRequest Request(string code="P-01",string? barcode=null)=>new(){RequestId=Guid.NewGuid(),Code=code,Name="상품 "+code,Unit="EA",Barcode=barcode==null?new(){Mode="none"}:new(){Mode="manual",Value=barcode}};

    [Fact]
    public async Task CreateReadUpdateDeactivateReactivateAndAuditPreserveIdentityAndTrackingValues()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var category=await Post(c,t.Root+"/categories",new{name="식품"},HttpStatusCode.OK);
        Assert.Equal(Id(category),Id(await Post(c,t.Root+"/categories",new{name=" 식품 "},HttpStatusCode.OK)));
        var r=Request(barcode:"  ORIGINAL-01  ");r.CategoryId=Id(category);r.LotManaged=true;r.ExpiryManaged=true;r.SerialManaged=true;r.SafetyStock=12.345m;r.Notes="비고";
        var p=await Post(c,t.Root,r);Assert.True(p.GetProperty("lotManaged").GetBoolean());Assert.True(p.GetProperty("expiryManaged").GetBoolean());Assert.True(p.GetProperty("serialManaged").GetBoolean());
        Assert.Equal(12.345m,p.GetProperty("safetyStock").GetDecimal());Assert.Equal("  ORIGINAL-01  ",p.GetProperty("barcode").GetString());Assert.Equal(t.Actor,p.GetProperty("createdByUserId").GetGuid());
        var detail=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));Assert.Equal("식품",detail.GetProperty("categoryName").GetString());
        r.Version=Version(p);r.Name="수정 상품";r.Barcode=new(){Mode="keep"};var updated=await Post(c,t.Root+"/"+Id(p),r,HttpStatusCode.OK);
        Assert.Equal(Id(p),Id(updated));Assert.Equal(p.GetProperty("createdAt").GetString(),updated.GetProperty("createdAt").GetString());Assert.Equal(t.Actor,updated.GetProperty("updatedByUserId").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+Id(p),r)).StatusCode);
        var inactive=await Post(c,t.Root+"/"+Id(p)+"/status",new{version=Version(updated),isActive=false},HttpStatusCode.OK);Assert.False(inactive.GetProperty("isActive").GetBoolean());
        var active=await Post(c,t.Root+"/"+Id(p)+"/status",new{version=Version(inactive),isActive=true},HttpStatusCode.OK);
        Assert.True(active.GetProperty("isActive").GetBoolean());Assert.Equal(Id(p),Id(active));
        var reloaded=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));Assert.True(reloaded.GetProperty("product").GetProperty("isActive").GetBoolean());
        Assert.Equal(HttpStatusCode.MethodNotAllowed,(await c.DeleteAsync(t.Root+"/"+Id(p))).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var audit=await db.ProductChanges.Where(x=>x.TargetId==Id(p)).OrderBy(x=>x.Id).ToListAsync();
        Assert.Equal(4,audit.Count);Assert.All(audit,x=>Assert.Equal(t.Actor,x.ChangedByUserId));Assert.Contains("수정",JsonSerializer.Deserialize<JsonElement>(audit[1].AfterJson).GetProperty("Name").GetString());
        audit[0].Action="Tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
    [Fact]
    public async Task DuplicatesAreTenantScopedAndFailedWritesDoNotCreateAuditOrProducts()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var p=await Post(c,t.Root,Request("Abc","LABEL"));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,Request(" abc ","OTHER"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,Request("DEF","LABEL"))).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await db.Products.ToListAsync());Assert.Single(await db.ProductChanges.ToListAsync());}
        await Login(c,t,"Other");var other=$"/api/tenants/{t.Other}/products";await Post(c,other,Request("ABC","LABEL"));
        Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(other+"/"+Id(p))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,other+"/"+Id(p),Request("NEW"))).StatusCode);
    }
    [Fact]
    public async Task FiltersAndPaginationUseRealTotalsAndCategoryIsolation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var cat=await Post(c,t.Root+"/categories",new{name="분류 A"},HttpStatusCode.OK);
        for(var i=0;i<23;i++){var r=Request($"P-{i:D2}");r.CategoryId=i%2==0?Id(cat):null;r.IsActive=i!=0;r.Name=i==22?"검색 대상":"일반 상품";await Post(c,t.Root,r);}
        var page=await c.GetFromJsonAsync<JsonElement>(t.Root+"?page=2");Assert.Equal(23,page.GetProperty("total").GetInt32());Assert.Equal(3,page.GetProperty("items").GetArrayLength());Assert.Equal("P-20",page.GetProperty("items")[0].GetProperty("product").GetProperty("code").GetString());
        var search=await c.GetFromJsonAsync<JsonElement>(t.Root+"?search="+Uri.EscapeDataString("검색"));Assert.Equal(1,search.GetProperty("total").GetInt32());
        var filtered=await c.GetFromJsonAsync<JsonElement>(t.Root+"?categoryId="+Id(cat)+"&status=active");Assert.Equal(11,filtered.GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(t.Root+"?pageSize=5000")).StatusCode);
        await Login(c,t,"Other");var other=$"/api/tenants/{t.Other}/products";var invalid=Request();invalid.CategoryId=Id(cat);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,other,invalid)).StatusCode);
        var options=await c.GetFromJsonAsync<JsonElement>(other+"/options");Assert.All(options.GetProperty("categories").EnumerateArray(), x => Assert.True(x.GetProperty("isSystem").GetBoolean()));Assert.Equal(ProductUnits.Codes, options.GetProperty("units").EnumerateArray().Select(x=>x.GetString()));
    }
    [Fact]
    public async Task ReadOnlyAndRevokedPermissionsDenyEveryWriteEndpointAndReads()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var p=await Post(c,t.Root,Request());await Login(c,t,"Reader");
        Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(t.Root)).StatusCode);
        foreach(var (url,body) in new (string,object)[]{(t.Root,Request()),(t.Root+"/"+Id(p),Request()),(t.Root+"/"+Id(p)+"/status",new{version=Version(p),isActive=false}),(t.Root+"/categories",new{name="Denied"}),(t.Root+"/barcode-candidates",new{})})
            Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url,body)).StatusCode);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"]["products"]=[];db.Add(new TenantPermissionSettings{TenantId=t.Tenant,UpdatedByUserId=t.Actor,UpdatedAt=DateTimeOffset.UtcNow,Version=Guid.NewGuid(),RolesJson=JsonSerializer.Serialize(roles)});await db.SaveChangesAsync();}
        foreach(var path in new[]{t.Root,t.Root+"/options",t.Root+"/"+Id(p)})Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(path)).StatusCode);
    }
    [Fact]
    public async Task GeneratedCandidateHasNoPreSaveDataAndKeepsExactValueOnReplay()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var candidate=await Post(c,t.Root+"/barcode-candidates",new{},HttpStatusCode.OK);var value=candidate.GetProperty("value").GetString();var proof=candidate.GetProperty("proof").GetString();Assert.Matches("^880[0-9]{17}$",value!);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Products.ToListAsync());Assert.Empty(await db.ProductChanges.ToListAsync());}
        var r=Request();r.Barcode=new(){Mode="auto",Value=value,Proof=proof};var saved=await Post(c,t.Root,r);var replay=await Post(c,t.Root,r);Assert.Equal(Id(saved),Id(replay));Assert.Equal(value,replay.GetProperty("barcode").GetString());Assert.True(replay.GetProperty("barcodeIsGenerated").GetBoolean());
        r.Name="Different replay";Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,r)).StatusCode);
        var duplicate=Request("P-02");duplicate.Barcode=new(){Mode="auto",Value=value,Proof=proof};Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root,duplicate)).StatusCode);
        var bad=Request("P-03");bad.Barcode=new(){Mode="auto",Value=value,Proof="tampered"};Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,bad)).StatusCode);
        bad.Barcode=new(){Mode="auto",Value=value,Proof=proof};bad.BarcodeType="External";bad.Version=Version(saved);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root+"/"+Id(saved),bad)).StatusCode);
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,$"/api/tenants/{t.Other}/products",duplicate)).StatusCode);
    }
    [Theory]
    [InlineData("EA","EA")][InlineData("개","EA")][InlineData("BOX","BOX")][InlineData("박스","BOX")]
    public async Task UnitsPersistCanonicalCodesWithoutChangingQuantityOrIdentity(string input,string expected)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var r=Request();r.Unit=input;r.SafetyStock=12.345m;if(expected!="EA"){Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,r)).StatusCode);return;}var p=await Post(c,t.Root,r);
        Assert.Equal(expected,p.GetProperty("unit").GetString());Assert.Equal(12.345m,p.GetProperty("safetyStock").GetDecimal());
        r.Version=Version(p);r.Unit=expected;var saved=await Post(c,t.Root+"/"+Id(p),r,HttpStatusCode.OK);
        Assert.Equal(Id(p),Id(saved));Assert.Equal(12.345m,saved.GetProperty("safetyStock").GetDecimal());
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(expected,(await db.Products.SingleAsync()).Unit);
    }
    [Theory]
    [InlineData("unit")][InlineData("negative")][InlineData("precision")][InlineData("code")][InlineData("barcode")][InlineData("name")]
    public async Task InvalidInputsNeverPersist(string invalid)
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var r=Request();
        switch(invalid){case "unit":r.Unit="INVALID";break;case "negative":r.SafetyStock=-1;break;case "precision":r.SafetyStock=1.0001m;break;case "code":r.Code="BAD\nCODE";break;case "name":r.Name=" ";break;case "barcode":r.Barcode=new(){Mode="manual",Value="BAD\n"};break;}
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,r)).StatusCode);
        using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Products.ToListAsync());Assert.Empty(await db.ProductChanges.ToListAsync());
    }
    [Fact]
    public async Task FirstBusinessUseLocksTrackingAndUnitAndRollbackLeavesPolicyEditable()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var r=Request();var p=await Post(c,t.Root,r);
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var usage=scope.ServiceProvider.GetRequiredService<ProductUsagePolicy>();
            await Assert.ThrowsAsync<InvalidOperationException>(()=>usage.LockForInventory(t.Tenant,Id(p)));
            await using var tx=await db.Database.BeginTransactionAsync();await usage.LockForInventory(t.Tenant,Id(p));await tx.RollbackAsync();
        }
        using(var scope=f.Services.CreateScope()) Assert.Null((await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Products.SingleAsync()).TrackingLockedAt);
        using(var scope=f.Services.CreateScope())
        {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();await using var tx=await db.Database.BeginTransactionAsync();await scope.ServiceProvider.GetRequiredService<ProductUsagePolicy>().LockForInventory(t.Tenant,Id(p));await tx.CommitAsync();}
        var data=await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(p));r.Version=Version(data.GetProperty("product"));
        foreach(var field in new[]{"unit"})
        {r.LotManaged=field=="lot";r.ExpiryManaged=field=="expiry";r.SerialManaged=field=="serial";r.Unit=field=="unit"?"kg":"EA";Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,t.Root+"/"+Id(p),r)).StatusCode);}
        r.LotManaged=false;r.ExpiryManaged=false;r.SerialManaged=false;r.Unit="개";r.Name="이름 변경 가능";await Post(c,t.Root+"/"+Id(p),r,HttpStatusCode.OK);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var locked=await context.Products.SingleAsync();locked.TrackingLockedAt=null;await Assert.ThrowsAsync<InvalidOperationException>(()=>context.SaveChangesAsync());
    }
    [Fact]
    public async Task DatabaseKeysPreventDuplicatesAndCrossTenantCategoryReferences()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await Post(c,t.Root,Request(barcode:"UNIQUE"));
        var category=await Post(c,t.Root+"/categories",new{name="A"},HttpStatusCode.OK);
        foreach(var conflict in new[]{"code","barcode","category"})
        {
            using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Products.Add(new(){TenantId=conflict=="category"?t.Other:t.Tenant,Code="Different",NormalizedCode=conflict=="code"?"P-01":"DIFFERENT",Name="Test",Barcode=conflict=="barcode"?"UNIQUE":null,CategoryId=conflict=="category"?Id(category):null,CreationRequestId=Guid.NewGuid()});
            await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());
        }
    }
}
