using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class PlanImportTests
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    [Fact] public async Task LocalPlanImportAndAtomicWorkspace() { using var f=new AuthFactory();using var init=f.Client();await Scenario(f); }
    [ScanPostgresFact] public async Task PostgresPlanImportAndAtomicWorkspace() { using var f=new ScanPostgresFactory();using var init=f.Client();await Scenario(f); }
    [Theory]
    [InlineData("wall",1.1,.1)] [InlineData("script",.5,.1)] [InlineData("rack",.5,0)]
    public void InvalidEngineGeometryIsRejected(string type,double x,double width) => Assert.Throws<OrganizationException>(()=>PlanImportService.Validate(JsonSerializer.SerializeToElement(new{aspectRatio=1.5,objects=new[]{new{type,x,y=.5,width,height=.1,rotation=0,fill="#ffffff",confidence=.5,evidence="test"}},warnings=Array.Empty<string>()})));
    [Fact] public void EngineCannotLinkPersistedIdentitiesOrConfirmItself()
    {
        var id=Guid.NewGuid();var raw=JsonSerializer.SerializeToElement(new{aspectRatio=1.5,objects=new[]{new{id,rackId=id,type="rack",x=.5,y=.5,width=.2,height=.1,rotation=90,fill="#ffffff",confidence=.5,evidence="test",reviewRequired=false}},warnings=Array.Empty<string>()});
        var result=JsonSerializer.SerializeToElement(PlanImportService.Validate(raw),Json).GetProperty("candidates")[0];
        Assert.True(result.GetProperty("reviewRequired").GetBoolean());Assert.NotEqual(id,result.GetProperty("object").GetProperty("id").GetGuid());Assert.Equal(JsonValueKind.Null,result.GetProperty("object").GetProperty("rackId").ValueKind);
    }
    [Fact] public async Task HanddrawnImportPersistsEditableObjectsWithoutInventoryChanges()
    {
        using var f=new AuthFactory();using var c=f.Client();
        var password="Test1!"+Guid.NewGuid().ToString("N");Guid tenant;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var company=new Tenant{Code="DRAWING",Name="격리 손그림 QA",BillingStatus=TenantBillingStatus.Paid};tenant=company.Id;
            var user=new ApplicationUser{UserName="drawing",Email="drawing@example.test",DisplayName="QA"};
            Assert.True((await users.CreateAsync(user,password)).Succeeded);
            db.TenantMemberships.Add(new(){Tenant=company,User=user,Role=TenantRole.Master,IsDefault=true});await db.SaveChangesAsync();
        }
        Assert.True((await AuthTests.Post(c,"/api/auth/login",new{email="drawing",password})).IsSuccessStatusCode);
        var env=f.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        var engine=Path.GetFullPath(Path.Combine(env.ContentRootPath,"..","tools","plan-recognition"));
        var start=new System.Diagnostics.ProcessStartInfo(Path.Combine(engine,".venv","bin","python")){RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        start.ArgumentList.Add(Path.Combine(engine,"test_handdrawn.py"));start.ArgumentList.Add("--png");
        using var process=System.Diagnostics.Process.Start(start)!;using var image=new MemoryStream();
        var stderr=process.StandardError.ReadToEndAsync();await process.StandardOutput.BaseStream.CopyToAsync(image);await process.WaitForExitAsync();await stderr;
        Assert.Equal(0,process.ExitCode);
        var root=$"/api/tenants/{tenant}";var endpoint=root+"/plan-imports";
        var csrf=await c.GetFromJsonAsync<JsonElement>("/api/auth/csrf");using var form=new MultipartFormDataContent();form.Add(new ByteArrayContent(image.ToArray()),"file","handdrawn.png");
        using var upload=new HttpRequestMessage(HttpMethod.Post,endpoint){Content=form};upload.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
        var response=await c.SendAsync(upload);Assert.Equal(HttpStatusCode.Accepted,response.StatusCode);
        var job=(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        async Task<JsonElement> Wait(string state){for(var i=0;i<240;i++){var j=await c.GetFromJsonAsync<JsonElement>(endpoint+"/"+job);Assert.NotEqual("Failed",j.GetProperty("status").GetString());if(j.GetProperty("status").GetString()==state)return j;await Task.Delay(100);}throw new TimeoutException();}
        await Wait("Ready");Assert.True((await AuthTests.Post(c,endpoint+"/"+job+"/analyze",new{})).IsSuccessStatusCode);
        var result=(await Wait("Completed")).GetProperty("result");
        var objects=result.GetProperty("candidates").EnumerateArray().Select(x=>x.GetProperty("object").Deserialize<PlanObjectDto>(Json)!).ToList();
        Assert.Equal(2,objects.Count(o=>o.Type=="rack"));Assert.Single(objects,o=>o.Type=="door");Assert.True(objects.Count(o=>o.Type=="wall")>=5);
        var request=new SaveWarehouseWorkspaceRequest{RequestId=Guid.NewGuid(),Warehouse=new(){Name="손그림 저장 QA"},Plan=new(){AspectRatio=result.GetProperty("aspectRatio").GetDouble(),Objects=objects}};
        foreach(var obj in objects.Where(o=>o.Type=="rack")){var rack=new WorkspaceRackRequest{ClientId=Guid.NewGuid(),Code=$"R-{request.Racks.Count+1:00}",Name="직접 확인한 랙",Levels=2,Bays=3,Barcode=new(){Mode="none"}};request.Racks.Add(rack);obj.RackId=rack.ClientId;obj.Label=rack.Name;}
        var saved=await AuthTests.Post(c,root+"/warehouses/workspace",request);Assert.True(saved.IsSuccessStatusCode,await saved.Content.ReadAsStringAsync());
        var warehouse=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("warehouseId").GetGuid();
        var reread=await c.GetFromJsonAsync<JsonElement>(root+"/warehouses/"+warehouse+"/workspace");
        var restored=reread.GetProperty("plan").GetProperty("objects").EnumerateArray().ToArray();
        Assert.Equal(objects.Count,restored.Length);
        foreach(var obj in objects){var restoredObject=restored.Single(x=>x.GetProperty("id").GetGuid()==obj.Id);Assert.Equal(obj.Type,restoredObject.GetProperty("type").GetString());Assert.Equal(obj.X,restoredObject.GetProperty("x").GetDouble(),5);Assert.Equal(obj.Y,restoredObject.GetProperty("y").GetDouble(),5);Assert.Equal(obj.Width,restoredObject.GetProperty("width").GetDouble(),5);Assert.Equal(obj.Height,restoredObject.GetProperty("height").GetDouble(),5);}
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(2,await db.WarehouseRacks.CountAsync());Assert.Empty(await db.StockBalances.ToListAsync());}
        Assert.Equal(HttpStatusCode.NoContent,(await AuthTests.Post(c,endpoint+"/"+job+"/discard",new{})).StatusCode);
    }
    static async Task Scenario(WebApplicationFactory<Program> f)
    {
        using var c=f.CreateClient(new(){BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});
        var password="Test1!"+Guid.NewGuid().ToString("N");Guid tenant,other;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var users=scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var t=new Tenant{Code="PLANIMPORT",Name="도면 변환 QA",BillingStatus=TenantBillingStatus.Paid};var o=new Tenant{Code="OTHER",Name="다른 기업",BillingStatus=TenantBillingStatus.Paid};tenant=t.Id;other=o.Id;
            foreach(var (name,org,role) in new[]{("Master",t,TenantRole.Master),("Peer",t,TenantRole.Administrator),("Reader",t,TenantRole.Employee),("Other",o,TenantRole.Master)}) {
                var u=new ApplicationUser{UserName=name,Email=name+"@plan-import.test",DisplayName=name};Assert.True((await users.CreateAsync(u,password)).Succeeded);db.TenantMemberships.Add(new(){Tenant=org,User=u,Role=role,IsDefault=true});
            }
            await db.SaveChangesAsync();
        }
        async Task Login(string name) { var r=await AuthTests.Post(c,"/api/auth/login",new{email=name,password});Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync()); }
        await Login("Master");var root=$"/api/tenants/{tenant}";var endpoint=root+"/plan-imports";
        async Task<JsonElement> Get(string url) { var r=await c.GetAsync(url);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>(); }
        async Task<JsonElement> Post(string url,object body) { var r=await AuthTests.Post(c,url,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>(); }
        async Task<HttpResponseMessage> Upload(string filename,byte[]? bytes=null) {
            var csrf=await c.GetFromJsonAsync<JsonElement>("/api/auth/csrf");using var data=new MultipartFormDataContent();data.Add(new ByteArrayContent(bytes??await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory,"Fixtures","PlanImport",filename))),"file",filename);
            using var req=new HttpRequestMessage(HttpMethod.Post,endpoint){Content=data};req.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());return await c.SendAsync(req);
        }
        async Task<JsonElement> Wait(Guid id,string state) {
            for(var i=0;i<240;i++){var j=await Get(endpoint+"/"+id);var s=j.GetProperty("status").GetString();if(state!="Failed")Assert.NotEqual("Failed",s);if(s==state)return j;await Task.Delay(100);}throw new TimeoutException("Local recognition did not finish");
        }
        async Task<Guid> Open(string filename) { var r=await Upload(filename);Assert.Equal(HttpStatusCode.Accepted,r.StatusCode);var id=(await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();await Wait(id,"Ready");return id; }
        async Task Discard(Guid id) {Assert.Equal(HttpStatusCode.NoContent,(await AuthTests.Post(c,endpoint+"/"+id+"/discard",new{})).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(endpoint+"/"+id)).StatusCode);}
        Assert.Equal(HttpStatusCode.BadRequest,(await Upload("fake.png",new byte[20])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Upload("evil.svg",new byte[20])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await Upload("large.png",new byte[20*1024*1024+1])).StatusCode);
        var brokenResponse=await Upload("broken.pdf",System.Text.Encoding.ASCII.GetBytes("%PDF-1.7\nnot a PDF structure"));Assert.Equal(HttpStatusCode.Accepted,brokenResponse.StatusCode);
        var broken=(await brokenResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();Assert.NotNull((await Wait(broken,"Failed")).GetProperty("error").GetString());await Discard(broken);
        var pdf=await Open("multipage.pdf");Assert.Equal(2,(await Get(endpoint+"/"+pdf)).GetProperty("metadata").GetProperty("pageCount").GetInt32());
        await Post(endpoint+"/"+pdf+"/analyze",new{});Assert.Empty((await Wait(pdf,"Completed")).GetProperty("result").GetProperty("candidates").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,endpoint+"/"+pdf+"/page",new{page=2,rotation=0})).StatusCode);
        await Post(endpoint+"/"+pdf+"/page",new{page=1,rotation=0});await Wait(pdf,"Ready");await Post(endpoint+"/"+pdf+"/analyze",new{});
        var result=(await Wait(pdf,"Completed")).GetProperty("result");var candidates=result.GetProperty("candidates").EnumerateArray().ToArray();
        var objects=candidates.Select(x=>x.GetProperty("object").Deserialize<PlanObjectDto>(Json)!).ToList();
        Assert.Equal(6,objects.Count(x=>x.Type=="rack"));foreach(var type in new[]{"wall","door","aisle","zone","shape"})Assert.Contains(objects,x=>x.Type==type);
        Assert.All(candidates,x=>Assert.True(x.GetProperty("reviewRequired").GetBoolean()));Assert.All(objects,x=>Assert.Null(x.RackId));
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.Warehouses.ToListAsync());Assert.Empty(await db.StockBalances.ToListAsync());}
        await Login("Peer");Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(endpoint+"/"+pdf)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(endpoint+"/"+pdf+"/preview")).StatusCode);
        await Login("Reader");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(endpoint+"/"+pdf)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,endpoint+"/"+pdf+"/analyze",new{})).StatusCode);
        await Login("Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(endpoint+"/"+pdf)).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{other}/plan-imports/{pdf}")).StatusCode);
        await Login("Master");var preview=await c.GetAsync(endpoint+"/"+pdf+"/preview");Assert.Equal("image/png",preview.Content.Headers.ContentType?.MediaType);await Discard(pdf);
        foreach(var filename in new[]{"structured.png","structured.jpg","structured.webp","vector.pdf"}) {
            var id=await Open(filename);await Post(endpoint+"/"+id+"/page",new{page=0,rotation=90});var ready=await Wait(id,"Ready");Assert.InRange(ready.GetProperty("metadata").GetProperty("aspectRatio").GetDouble(),.66,.68);
            await Post(endpoint+"/"+id+"/analyze",new{});var converted=await Wait(id,"Completed");Assert.Equal(6,converted.GetProperty("result").GetProperty("candidates").EnumerateArray().Count(x=>x.GetProperty("object").GetProperty("type").GetString()=="rack"));await Discard(id);
        }
        // Only the existing final workspace API persists warehouse/rack/location identities.
        var request=new SaveWarehouseWorkspaceRequest{RequestId=Guid.NewGuid(),Warehouse=new(){Name="자동 인식 저장 QA"},Plan=new(){AspectRatio=result.GetProperty("aspectRatio").GetDouble(),Objects=objects}};
        foreach(var obj in objects.Where(o=>o.Type=="rack")) {var rack=new WorkspaceRackRequest{ClientId=Guid.NewGuid(),Code=$"R-{request.Racks.Count+1:00}",Name="확인된 랙",Levels=2,Bays=3,Barcode=new(){Mode="none"}};request.Racks.Add(rack);obj.RackId=rack.ClientId;obj.Label=rack.Code;}
        foreach(var obj in objects.Where(o=>o.Type=="zone")){var zone=new WorkspaceStructureRequest{ClientId=Guid.NewGuid(),Code="Z-01",Name="확인된 구역"};request.Zones.Add(zone);obj.ZoneId=zone.ClientId;}
        var saved=await Post(root+"/warehouses/workspace",request);var warehouse=saved.GetProperty("warehouseId").GetGuid();Assert.Equal(warehouse,(await Post(root+"/warehouses/workspace",request)).GetProperty("warehouseId").GetGuid());
        Assert.Equal(36,saved.GetProperty("rackLocations").EnumerateObject().Count());
        var workspace=await Get(root+"/warehouses/"+warehouse+"/workspace");Assert.Contains("R-01",workspace.ToString());
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Single(await db.Warehouses.Where(x=>x.TenantId==tenant).ToListAsync());Assert.Equal(6,await db.WarehouseRacks.CountAsync(x=>x.TenantId==tenant));Assert.Empty(await db.StockBalances.ToListAsync());
            var path=Environment.GetEnvironmentVariable("WMS_PLANIMPORT_QA_FIXTURE");if(db.Database.IsNpgsql()&&!string.IsNullOrEmpty(path))await File.WriteAllTextAsync(path,JsonSerializer.Serialize(new{tenant,other,password,warehouse}));
        }
    }
}
