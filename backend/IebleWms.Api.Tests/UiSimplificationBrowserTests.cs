using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class UiSimplificationBrowserFactAttribute : FactAttribute
{
    public UiSimplificationBrowserFactAttribute() { if(Environment.GetEnvironmentVariable("WMS_UI_SIMPLIFICATION_BROWSER")!="1") Skip="Opt-in isolated list UI integration QA"; }
}
public sealed partial class ReceiptTests
{
    [UiSimplificationBrowserFact]
    public async Task UiSimplificationRealBrowserPreservesSelectionAndPartnerLink()
    {
        using var f=new AuthFactory(isolatedConnections:true);f.UseKestrel(5086);
        using var c=f.CreateClient(new(){BaseAddress=new Uri("http://localhost:5086"),AllowAutoRedirect=false});
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.True(db.Database.IsSqlite());await db.Database.EnsureCreatedAsync();}
        var t=await Seed(f);var s=await Setup(f,t);Guid reader;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.StockBalances.AddRange(new IebleWms.Api.Models.StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,ProductId=s.Bulk,Unit="kg",SourceKey="UI-BULK",Quantity=10,ReservedQuantity=2},new IebleWms.Api.Models.StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,ProductId=s.Serial,Unit="EA",SourceKey="UI-SERIAL",Quantity=3,ReservedQuantity=1});
            await db.SaveChangesAsync();
        }
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var manager=scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<IebleWms.Api.Models.ApplicationUser>>();
            Assert.True((await manager.CreateAsync(new(){UserName="UiAdmin",Email="ui-admin@qa.test",DisplayName="QA 관리자",SystemRole=IebleWms.Api.Models.SystemRole.IebleAdministrator},t.Password)).Succeeded);
            var master=await db.Users.SingleAsync(x=>x.Id==t.Actor);master.DisplayName="김철수";
            var other=await db.Users.SingleAsync(x=>x.UserName=="Reader");other.DisplayName="이영희";other.Email="logistics@qa.test";reader=other.Id;
            (await db.Warehouses.SingleAsync(x=>x.Id==s.Warehouse)).CustomCode="SEARCH-WAREHOUSE";
            var department=new IebleWms.Api.Models.Department{TenantId=t.Tenant,Name="물류관리팀",NormalizedName="물류관리팀"};db.Departments.Add(department);
            var child=new IebleWms.Api.Models.Department{TenantId=t.Tenant,Name="검수팀",NormalizedName="검수팀",ParentId=department.Id};db.Departments.Add(child);
            db.Departments.Add(new(){TenantId=t.Tenant,Name="포장팀",NormalizedName="포장팀",ParentId=child.Id});
            (await db.TenantMemberships.SingleAsync(x=>x.TenantId==t.Tenant&&x.UserId==reader)).DepartmentId=department.Id;
            for(int i=0;i<25;i++)db.Partners.Add(new(){TenantId=t.Tenant,Code="QA"+i,NormalizedCode="QA"+i,Name=$"QA물류{i:00}",BusinessRegistrationNumber="123-45-67890",Phone="02-1234-5678",Address="서울특별시",AddressDetail="QA동",CreationRequestId=Guid.NewGuid()});
            await db.SaveChangesAsync();
        }
        var info=new ProcessStartInfo("node","tests/ui-simplification.ui.mjs"){WorkingDirectory=Path.GetFullPath("../../../../../frontend",AppContext.BaseDirectory),RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        info.Environment["UI_ORIGIN"]=Environment.GetEnvironmentVariable("WMS_UI_SIMPLIFICATION_ORIGIN")??"http://127.0.0.1:5176";
        using var process=Process.Start(info)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,actor=t.Actor,reader,product=s.Bulk,warehouse=s.Warehouse,partner=s.Partner}));process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(5));try{await process.WaitForExitAsync(timeout.Token);}catch{process.Kill(true);throw;}
        Assert.True(process.ExitCode==0,(await output)+"\n"+(await error));Console.WriteLine(await output);
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.All(await context.ReceiptChanges.ToListAsync(),x=>Assert.Equal(t.Actor,x.ActorId));
        Assert.Equal(25,await context.Partners.CountAsync(x=>x.TenantId==t.Tenant&&x.Code.StartsWith("QA")));
        if(Environment.GetEnvironmentVariable("WMS_DATE_LAYOUT_ONLY")=="1") return;
        var linked=await context.TenantMemberships.SingleAsync(x=>x.TenantId==t.Tenant&&x.CompanyName=="QA물류24");Assert.NotNull(linked.PartnerId);
        Assert.Equal("QA물류24",(await context.Partners.SingleAsync(x=>x.Id==linked.PartnerId)).Name);
    }
}
