using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class SupportTests
{
    record Fixture(Guid Tenant,Guid Other,Guid Admin,string Password){public string Root=>$"/api/tenants/{Tenant}/support";}
    static async Task<Fixture> Seed(AuthFactory f)
    {
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var users=s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();var password="Test1!"+Guid.NewGuid().ToString("N");
        var a=new Tenant{Code="SUPPORT",Name="문의 기업"};var b=new Tenant{Code="OTHER",Name="다른 기업"};Guid admin=default;
        foreach(var name in new[]{"Master","Staff","Peer","Manager","Other","Admin"}){
            var u=new ApplicationUser{UserName=name,Email=name+"@support.test",DisplayName=name,SystemRole=name=="Admin"?SystemRole.IebleAdministrator:SystemRole.None};Assert.True((await users.CreateAsync(u,password)).Succeeded);
            if(name=="Admin")admin=u.Id;else db.Add(new TenantMembership{Tenant=name=="Other"?b:a,User=u,Role=name is "Master" or "Other"?TenantRole.Master:name=="Manager"?TenantRole.Administrator:TenantRole.Employee});
        }
        await db.SaveChangesAsync();return new(a.Id,b.Id,admin,password);
    }
    static async Task Login(HttpClient c,Fixture f,string user="Staff")=>Assert.Equal(HttpStatusCode.OK,(await AuthTests.Post(c,"/api/auth/login",new{email=user,password=f.Password})).StatusCode);
    static async Task<HttpResponseMessage> Create(HttpClient c,string root,Guid? request=null,string title="지원 요청",string category="Service",string? filename="proof.txt",byte[]? content=null,bool csrf=true)
    {
        var form=new MultipartFormDataContent();form.Add(new StringContent((request??Guid.NewGuid()).ToString()),"requestId");form.Add(new StringContent(title),"title");form.Add(new StringContent(category),"category");form.Add(new StringContent("문의 내용\n다음 줄"),"message");form.Add(new StringContent(Guid.NewGuid().ToString()),"userId");form.Add(new StringContent(Guid.NewGuid().ToString()),"tenantId");
        if(filename!=null)form.Add(new ByteArrayContent(content??Encoding.UTF8.GetBytes("hello 첨부")),"files",filename);
        var r=new HttpRequestMessage(HttpMethod.Post,root){Content=form};if(csrf)r.Headers.Add("X-CSRF-TOKEN",(await c.GetFromJsonAsync<JsonElement>("/api/auth/csrf")).GetProperty("token").GetString());return await c.SendAsync(r);
    }
    static async Task<JsonElement> Body(HttpResponseMessage r,HttpStatusCode code=HttpStatusCode.OK){Assert.True(r.StatusCode==code,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
    static async Task<JsonElement> Get(HttpClient c,string url)=>await Body(await c.GetAsync(url));
    [Fact]public async Task InquiryAttachmentAnswerRevisionAssignmentClosureAndOriginalPreservation()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var saved=await Body(await Create(c,t.Root),HttpStatusCode.Created);var id=saved.GetProperty("id").GetGuid();var url=t.Root+"/"+id;var d=await Get(c,url);
        Assert.Equal("Staff",d.GetProperty("author").GetString());Assert.Equal(t.Tenant,d.GetProperty("tenantId").GetGuid());
        var file=d.GetProperty("attachments")[0].GetProperty("id").GetGuid();var bytes=await c.GetByteArrayAsync(url+"/attachments/"+file);Assert.Equal("hello 첨부",Encoding.UTF8.GetString(bytes));
        using var admin=f.CreateClient();await Login(admin,t,"Admin");var adminUrl="/api/admin/support/"+id;
        var r=await AuthTests.Post(admin,adminUrl,new{version=d.GetProperty("version").GetGuid(),status="InProgress",assignedToId=t.Admin});await Body(r);
        d=await Get(admin,adminUrl);await Body(await AuthTests.Post(admin,adminUrl,new{version=d.GetProperty("version").GetGuid(),status="Answered",assignedToId=t.Admin,answer="첫 답변"}));
        d=await Get(admin,adminUrl);var stale=d.GetProperty("version").GetGuid();await Body(await AuthTests.Post(admin,adminUrl,new{version=stale,status="Answered",assignedToId=t.Admin,answer="수정 답변"}));
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(admin,adminUrl,new{version=stale,status="Closed",answer="수정 답변"})).StatusCode);
        d=await Get(c,url);Assert.Equal("수정 답변",d.GetProperty("answer").GetString());Assert.Equal("Admin",d.GetProperty("answerer").GetString());Assert.Equal(4,d.GetProperty("history").GetArrayLength());Assert.Contains("첫 답변",JsonSerializer.Deserialize<JsonElement>(d.GetProperty("history")[0].GetProperty("beforeJson").GetString()!).GetProperty("Answer").GetString());
        await Body(await AuthTests.Post(admin,adminUrl,new{version=d.GetProperty("version").GetGuid(),status="Closed",answer="수정 답변"}));d=await Get(admin,adminUrl);
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(admin,adminUrl,new{version=d.GetProperty("version").GetGuid(),status="Answered",answer="재변경"})).StatusCode);
        using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var original=await db.BillingFeedbacks.SingleAsync();Assert.Equal("문의 내용\n다음 줄",original.Message);Assert.Equal(5,await db.SupportChanges.CountAsync());original.Message="tamper";await Assert.ThrowsAsync<InvalidOperationException>(()=>db.SaveChangesAsync());
    }
    [Fact]public async Task EmployeeOwnOnlyTenantIsolationAdminBoundaryPermissionAndCsrf()
    {
        using var f=new AuthFactory();using var staff=f.Client();var t=await Seed(f);await Login(staff,t);var saved=await Body(await Create(staff,t.Root),HttpStatusCode.Created);var id=saved.GetProperty("id").GetGuid();var d=await Get(staff,t.Root+"/"+id);var file=d.GetProperty("attachments")[0].GetProperty("id").GetGuid();
        using var peer=f.CreateClient();await Login(peer,t,"Peer");Assert.Equal(0,(await Get(peer,t.Root)).GetProperty("total").GetInt32());Assert.Equal(HttpStatusCode.NotFound,(await peer.GetAsync(t.Root+"/"+id)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await peer.GetAsync(t.Root+"/"+id+"/attachments/"+file)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await staff.GetAsync("/api/admin/support")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await staff.GetAsync("/api/admin/overview")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await staff.GetAsync("/api/admin/tenants/"+t.Tenant)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(staff,"/api/admin/support/"+id,new{status="Answered",answer="hack"})).StatusCode);
        using var other=f.CreateClient();await Login(other,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await other.GetAsync(t.Root)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await other.GetAsync($"/api/tenants/{t.Other}/support/{id}/attachments/{file}")).StatusCode);
        using var manager=f.CreateClient();await Login(manager,t,"Manager");Assert.Equal(1,(await Get(manager,t.Root)).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await Create(staff,t.Root,csrf:false)).StatusCode);
        using(var s=f.Services.CreateScope()){var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var roles=PermissionCatalog.Defaults();roles["Employee"]["support"]=["menu","read"];roles["Administrator"]["support"]=["menu","read","create"];db.TenantPermissionSettings.Add(new(){TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(roles),UpdatedByUserId=t.Admin,UpdatedAt=DateTimeOffset.UtcNow});await db.SaveChangesAsync();}
        Assert.Equal(HttpStatusCode.Forbidden,(await Create(staff,t.Root)).StatusCode);Assert.Equal(0,(await Get(manager,t.Root)).GetProperty("total").GetInt32());
    }
    [Theory][InlineData("evil.exe","MZ")][InlineData("fake.png","bad")][InlineData("fake.pdf","%PDF-")][InlineData("fake.docx","PK")][InlineData("a.txt","\0")]
    public async Task UnsafeFilesFailWithoutPartialInquiry(string filename,string value)
    {using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);Assert.Equal(HttpStatusCode.BadRequest,(await Create(c,t.Root,filename:filename,content:Encoding.UTF8.GetBytes(value))).StatusCode);using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.BillingFeedbacks.ToListAsync());Assert.Empty(await db.SupportAttachments.ToListAsync());Assert.Empty(await db.SupportChanges.ToListAsync());}
    [Fact]public async Task RepeatedRequestIsIdempotentAndFiltersUseServerPagesAndKoreanDateBoundaries()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var request=Guid.NewGuid();var first=await Body(await Create(c,t.Root,request),HttpStatusCode.Created);var second=await Body(await Create(c,t.Root,request),HttpStatusCode.Created);Assert.Equal(first.GetProperty("id").GetGuid(),second.GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict,(await Create(c,t.Root,request,title:"changed")).StatusCode);
        for(var i=0;i<22;i++)await Body(await Create(c,t.Root,title:"목록 "+i,category:"Bug",filename:null),HttpStatusCode.Created);
        var list=await Get(c,t.Root+"?category=Bug&search="+Uri.EscapeDataString("목록")+"&page=2");Assert.Equal(22,list.GetProperty("total").GetInt32());Assert.Equal(2,list.GetProperty("items").GetArrayLength());
        Assert.Equal(2,(await Get(c,t.Root+"?page=999")).GetProperty("page").GetInt32());var today=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(9)).DateTime).ToString("yyyy-MM-dd");Assert.Equal(23,(await Get(c,t.Root+"?start="+today+"&end="+today)).GetProperty("total").GetInt32());Assert.Equal(1,(await Get(c,t.Root+"?search="+first.GetProperty("number").GetString())).GetProperty("total").GetInt32());
    }
    [Fact]public async Task LegacyFeedbackVisibleAdminCountsAndBillingReadsNeverChangePayments()
    {
        using var f=new AuthFactory();using var master=f.Client();var t=await Seed(f);await Login(master,t,"Master");await Body(await AuthTests.Post(master,$"/api/tenants/{t.Tenant}/subscription/feedback",new{requestId=Guid.NewGuid(),message="기존 소감"}));
        using var admin=f.CreateClient();await Login(admin,t,"Admin");var list=await Get(admin,"/api/admin/support?category=Billing");Assert.Equal(1,list.GetProperty("total").GetInt32());Assert.Equal("QA01",list.GetProperty("items")[0].GetProperty("number").GetString());
        var detail=await Get(admin,"/api/admin/tenants/"+t.Tenant);Assert.Equal(4,detail.GetProperty("userCount").GetInt32());Assert.False(detail.GetProperty("billing").GetProperty("providerConfigured").GetBoolean());Assert.Equal("CardRequired",detail.GetProperty("tenant").GetProperty("billingStatus").GetString());
        var overview=await Get(admin,"/api/admin/overview");Assert.Equal(2,overview.GetProperty("tenantCount").GetInt32());Assert.Equal(1,overview.GetProperty("pendingInquiryCount").GetInt32());
        Assert.Equal(2,(await Get(admin,"/api/admin/tenants?billingStatus=CardRequired")).GetProperty("total").GetInt32());using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.BillingInvoices.ToListAsync());Assert.Empty(await db.BillingChanges.ToListAsync());Assert.All(await db.Tenants.ToListAsync(),x=>Assert.Equal(TenantBillingStatus.CardRequired,x.BillingStatus));
    }
    [Theory]
    [InlineData("start=0001-01-01")]
    [InlineData("end=9999-12-31")]
    [InlineData("start=2026-11-01&end=2026-10-01")]
    public async Task InvalidDateBoundariesReturnValidationErrorsInsteadOfServerErrors(string query)
    {
        using var f=new AuthFactory();using var staff=f.Client();var t=await Seed(f);await Login(staff,t);
        Assert.Equal(HttpStatusCode.BadRequest,(await staff.GetAsync(t.Root+"?"+query)).StatusCode);
        using var admin=f.CreateClient();await Login(admin,t,"Admin");
        Assert.Equal(HttpStatusCode.BadRequest,(await admin.GetAsync("/api/admin/support?"+query)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await admin.GetAsync("/api/admin/tenants?"+query)).StatusCode);
    }
}
