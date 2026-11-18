using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class ScanPostgresFactAttribute : FactAttribute
{
    public ScanPostgresFactAttribute() { if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WMS_SCAN_QA_CONNECTION"))) Skip = "Set WMS_SCAN_QA_CONNECTION to an isolated ieble_wms_scan_qa_* database."; }
}
internal sealed class ScanPostgresFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connection = Environment.GetEnvironmentVariable("WMS_SCAN_QA_CONNECTION")!;
        if (new NpgsqlConnectionStringBuilder(connection).Database?.StartsWith("ieble_wms_scan_qa_", StringComparison.Ordinal) != true) throw new InvalidOperationException("A dedicated scan QA database is required.");
        builder.UseEnvironment("Development");
        builder.ConfigureServices(services => {
            services.RemoveAll<DbContextOptions<WmsDbContext>>();services.RemoveAll<IDbContextOptionsConfiguration<WmsDbContext>>();services.RemoveAll<WmsDbContext>();
            services.AddDbContext<WmsDbContext>(options => options.UseNpgsql(connection));
        });
    }
    public HttpClient Client()
    {
        var client=CreateClient(new WebApplicationFactoryClientOptions{BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});
        using var scope=Services.CreateScope();scope.ServiceProvider.GetRequiredService<WmsDbContext>().Database.Migrate();return client;
    }
}
public sealed partial class ShipmentTests
{
    [ScanPostgresFact] public async Task PostgresScanConcurrencyReplayManualConflictAndConfirmation()
    {
        using var f=new ScanPostgresFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);
        var receipt=Request(s);receipt.Lines=[new(){ProductId=s.Serial,ExpectedQuantity=20,LotNumber="CONCURRENT"}];
        var inbound=await Post(c,t.Root,receipt);var receiptUrl=t.Root+"/"+Id(Doc(inbound));
        inbound=await Post(c,receiptUrl+"/start-inspection",new{version=Version(Doc(inbound))},HttpStatusCode.OK);
        var incoming=await Task.WhenAll(Enumerable.Range(0,25).Select(_=>Post(c,receiptUrl+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK)));
        Assert.Equal(20,incoming.Count(x=>x.GetProperty("outcome").GetString()=="applied"));Assert.Equal(5,incoming.Count(x=>x.GetProperty("outcome").GetString()=="over-limit"));
        inbound=await c.GetFromJsonAsync<JsonElement>(receiptUrl);Assert.Equal(20,Line(inbound).GetProperty("inspectedQuantity").GetDecimal());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.Where(x=>x.TenantId==t.Tenant).ToListAsync());}
        inbound=await Post(c,receiptUrl+"/inspection",new{version=Version(Doc(inbound)),lines=new[]{new{lineId=Id(Line(inbound)),quantity=20,lotNumber="CONCURRENT"}}},HttpStatusCode.OK);
        inbound=await Post(c,receiptUrl+"/placements",new{version=Version(Doc(inbound)),lines=new[]{new{lineId=Id(Line(inbound)),placements=new[]{new{locationId=s.Location,quantity=20}}}}},HttpStatusCode.OK);
        await Post(c,receiptUrl+"/confirm",new{version=Version(Doc(inbound))},HttpStatusCode.OK);
        var d=await Post(c,Root(t),OutRequest(s,20,true));d=await Action(c,t,d,"start-picking");var url=Root(t)+"/"+Id(Shipment(d));
        foreach(var stage in new[]{"picking","inspection"})
        {
            var old=d;var same=new{requestId=Guid.NewGuid(),barcode="CANDY-B",locationId=s.Location};
            var replay=await Task.WhenAll(Enumerable.Range(0,8).Select(_=>Post(c,url+"/scan-"+stage,same,HttpStatusCode.OK)));
            Assert.Equal(1,replay.Count(x=>!x.GetProperty("replayed").GetBoolean()));
            Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/"+stage,WorkBody(old,false,2))).StatusCode);
            var scans=await Task.WhenAll(Enumerable.Range(0,24).Select(_=>Post(c,url+"/scan-"+stage,new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK)));
            Assert.Equal(19,scans.Count(x=>x.GetProperty("outcome").GetString()=="applied"));Assert.Equal(5,scans.Count(x=>x.GetProperty("outcome").GetString()=="over-limit"));
            d=await c.GetFromJsonAsync<JsonElement>(url);Assert.Equal(20,d.GetProperty("allocations")[0].GetProperty(stage=="picking"?"pickedQuantity":"inspectedQuantity").GetDecimal());
            using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.SingleAsync(x=>x.TenantId==t.Tenant);Assert.Equal(20,stock.Quantity);Assert.Equal(20,stock.ReservedQuantity);Assert.Single(await db.StockMovements.Where(x=>x.TenantId==t.Tenant).ToListAsync());}
            d=await Work(c,t,d,stage);
        }
        await Task.WhenAll(Enumerable.Range(0,8).Select(_=>Action(c,t,d,"confirm")));
        using var verify=f.Services.CreateScope();var context=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var balance=await context.StockBalances.SingleAsync(x=>x.TenantId==t.Tenant);Assert.Equal(0,balance.Quantity);Assert.Equal(0,balance.ReservedQuantity);
        Assert.Equal(40,await context.ShipmentChanges.CountAsync(x=>x.TenantId==t.Tenant&&x.ScanRequestId!=null));Assert.Equal(1,await context.ShipmentChanges.CountAsync(x=>x.TenantId==t.Tenant&&x.Action=="Confirmed"));Assert.Equal(2,await context.StockMovements.CountAsync(x=>x.TenantId==t.Tenant));
        // Retain a reviewable QA fixture for Chrome on the actual development frontend.
        await ReceiveCount(c,t,s,20);var ui=await Post(c,Root(t),OutRequest(s,20,true));ui=await Action(c,t,ui,"start-picking");
        var output=Environment.GetEnvironmentVariable("WMS_SCAN_QA_FIXTURE");
        if(!string.IsNullOrEmpty(output)) await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,shipment=Id(Shipment(ui)),product=s.Serial,warehouse=s.Warehouse,partner=s.Partner,location=s.Location}));
    }
}
