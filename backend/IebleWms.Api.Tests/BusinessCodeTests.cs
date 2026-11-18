using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class BusinessCodeTests
{
    [Fact] public async Task AllPrefixesAreTenantScopedGrowBeyond99AndPersistHighWaterMark()
    {
        using var f=new AuthFactory();using var c=f.Client();using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();
        var a=new Tenant{Code="CODE-A",Name="A"};var b=new Tenant{Code="CODE-B",Name="B"};db.AddRange(a,b);await db.SaveChangesAsync();
        async Task<string> Next(Guid tenant,string prefix){await using var tx=await db.Database.BeginTransactionAsync();var value=await BusinessCodes.Next(db,tenant,prefix,default);await db.SaveChangesAsync();await tx.CommitAsync();return value;}
        foreach(var prefix in new[]{"PR","IN","PK","QA","WH","ST","MV","AD"})
        {
            Assert.Equal(prefix+"01",await Next(a.Id,prefix));Assert.Equal(prefix+"01",await Next(b.Id,prefix));
            var counter=await db.BusinessCodeCounters.SingleAsync(x=>x.TenantId==a.Id&&x.Prefix==prefix);counter.LastValue=98;await db.SaveChangesAsync();
            Assert.Equal(prefix+"99",await Next(a.Id,prefix));Assert.Equal(prefix+"100",await Next(a.Id,prefix));
        }
        var manual=new Product{TenantId=a.Id,Code="PR101",NormalizedCode="PR101",Name="수동 코드",Unit="EA",CreationRequestId=Guid.NewGuid()};db.Add(manual);await db.SaveChangesAsync();Assert.Equal("PR102",await Next(a.Id,"PR"));Assert.Equal("PR103",await Next(a.Id,"PR"));
        // A rolled-back registration does not consume or poison the next successful transaction.
        await using(var tx=await db.Database.BeginTransactionAsync()){Assert.Equal("WH101",await BusinessCodes.Next(db,a.Id,"WH",default));await db.SaveChangesAsync();await tx.RollbackAsync();}db.ChangeTracker.Clear();Assert.Equal("WH101",await Next(a.Id,"WH"));
    }
    [ScanPostgresFact] public async Task PostgresCounterSerializesAcrossConnectionsAndSeedsExistingCodes()
    {
        using var f=new ScanPostgresFactory();using var c=f.Client();var tenant=new Tenant{Code="CODES-"+Guid.NewGuid().ToString("N").ToUpperInvariant(),Name="격리 코드 QA"};
        using(var s=f.Services.CreateScope()){var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();var users=s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();var suffix=Guid.NewGuid().ToString("N");var user=new ApplicationUser{UserName="codes-"+suffix,Email=suffix+"@qa.test",DisplayName="격리 QA"};Assert.True((await users.CreateAsync(user,"QA1!"+suffix)).Succeeded);db.Add(new TenantMembership{Tenant=tenant,User=user,Role=TenantRole.Master});db.Add(new Product{TenantId=tenant.Id,Code="PR99",NormalizedCode="PR99",Name="기존 코드",CreationRequestId=Guid.NewGuid()});await db.SaveChangesAsync();}
        async Task<string> Next(string prefix){using var s=f.Services.CreateScope();var db=s.ServiceProvider.GetRequiredService<WmsDbContext>();await using var tx=await db.Database.BeginTransactionAsync();var value=await BusinessCodes.Next(db,tenant.Id,prefix,default);await db.SaveChangesAsync();await tx.CommitAsync();return value;}
        foreach(var prefix in new[]{"PR","IN","PK","QA","WH","ST","MV","AD"})
        {var values=await Task.WhenAll(Enumerable.Range(0,12).Select(_=>Next(prefix)));Assert.Equal(12,values.Distinct().Count());Assert.Contains(prefix+(prefix=="PR"?"100":"01"),values);Assert.Contains(prefix+(prefix=="PR"?"111":"12"),values);}
    }
}
public sealed partial class ProductTests
{
    [Fact] public async Task CompactCodeStartsAboveHistoricalDeletedAndRenamedCodes()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.Add(new ProductChange{TenantId=t.Tenant,TargetId=Guid.NewGuid(),ChangedByUserId=t.Actor,Action="ProductDeleted",BeforeJson="{\"Code\":\"PR123\"}",AfterJson="{\"deleted\":true}"});await db.SaveChangesAsync();}
        Assert.Equal("PR124",(await Post(c,t.Root,Request(""))).GetProperty("code").GetString());
        var manual=await Post(c,t.Root,Request("PR200"));var changed=Request("USER-CODE");changed.Version=Version(manual);await Post(c,t.Root+"/"+Id(manual),changed,HttpStatusCode.OK);
        Assert.Equal("PR201",(await Post(c,t.Root,Request(""))).GetProperty("code").GetString());
    }

    [Fact] public async Task CompactCodesPreserveLegacyCodesSearchBarcodeAndExistingManualCollision()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);
        var old=await Post(c,t.Root,Request("PRD-000001","BAR-KEEP"));var manual=await Post(c,t.Root,Request("pr99"));var item=await Post(c,t.Root,Request(""));Assert.Equal("PR100",item.GetProperty("code").GetString());
        foreach(var code in new[]{"PRD-000001","PR100"})Assert.Equal(1,(await c.GetFromJsonAsync<JsonElement>(t.Root+"?search="+code)).GetProperty("total").GetInt32());
        var original=(await c.GetFromJsonAsync<JsonElement>(t.Root+"/"+Id(old))).GetProperty("product");Assert.Equal("PRD-000001",original.GetProperty("code").GetString());Assert.Equal("BAR-KEEP",original.GetProperty("barcode").GetString());
        await Post(c,t.Root+"/"+Id(item)+"/delete",new{version=Version(item)},HttpStatusCode.OK);Assert.Equal("PR101",(await Post(c,t.Root,Request(""))).GetProperty("code").GetString());
        await Login(c,t,"Other");var second=await Post(c,$"/api/tenants/{t.Other}/products",Request(""));Assert.Equal("PR01",second.GetProperty("code").GetString());
    }
}
public sealed partial class ReceiptTests
{
    [Fact] public async Task EveryBusinessCreationEndpointUsesItsCompactNumberWithoutChangingBarcodes()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var root=$"/api/tenants/{t.Tenant}";
        var product=await Post(c,root+"/products",new IebleWms.Api.Contracts.ProductRequest{RequestId=Guid.NewGuid(),Name="코드 QA",Code="",Unit="EA"});Assert.Equal("PR01",product.GetProperty("code").GetString());
        var warehouse=await Post(c,root+"/warehouses",new{name="신규 창고",requestId=Guid.NewGuid()});Assert.Equal("WH01",warehouse.GetProperty("code").GetString());
        var receipt=await Post(c,t.Root,Request(s));Assert.Equal("IN01",Doc(receipt).GetProperty("number").GetString());
        var adjustment=await Post(c,root+"/inventory/adjust",new IebleWms.Api.Contracts.InventoryRequest{RequestId=Guid.NewGuid(),ProductId=s.Serial,WarehouseId=s.Warehouse,LocationId=s.Location,Quantity=5,Increase=true,OccurredAt=DateTimeOffset.UtcNow,Reason="격리 코드 QA"});Assert.Equal("AD01",adjustment.GetProperty("operation").GetProperty("number").GetString());
        Guid stockId,version;var destination=Guid.NewGuid();
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.SingleAsync();stockId=stock.Id;version=stock.Version;db.Add(new StorageLocation{Id=destination,TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="CODE-DEST",Name="격리 목적지"});await db.SaveChangesAsync();}
        var move=await Post(c,root+"/inventory/move",new IebleWms.Api.Contracts.InventoryRequest{RequestId=Guid.NewGuid(),StockId=stockId,Version=version,WarehouseId=s.Warehouse,LocationId=destination,Quantity=1,OccurredAt=DateTimeOffset.UtcNow,Reason="격리 코드 QA"});Assert.Equal("MV01",move.GetProperty("operation").GetProperty("number").GetString());
        var shipment=await Post(c,root+"/shipments",new IebleWms.Api.Contracts.ShipmentRequest{RequestId=Guid.NewGuid(),PartnerId=s.Partner,WarehouseId=s.Warehouse,ContactName="QA",RequestDate=new(2026,11,9),ExpectedDate=new(2026,11,9),Lines=[new(){ProductId=s.Serial,RequestedQuantity=1}]});Assert.Equal("PK01",shipment.GetProperty("shipment").GetProperty("number").GetString());
        var count=await Post(c,root+"/stocktakes",new IebleWms.Api.Contracts.StocktakeRequest{RequestId=Guid.NewGuid(),Name="코드 QA",WarehouseId=s.Warehouse,BasisAt=DateTimeOffset.UtcNow,ContactName="QA"});Assert.Equal("ST01",count.GetProperty("document").GetProperty("number").GetString());
        using var form=new MultipartFormDataContent();foreach(var pair in new[]{("requestId",Guid.NewGuid().ToString()),("title","격리 문의"),("category","Service"),("message","격리 문의 내용")})form.Add(new StringContent(pair.Item2),pair.Item1);
        using var request=new HttpRequestMessage(HttpMethod.Post,root+"/support"){Content=form};request.Headers.Add("X-CSRF-TOKEN",(await c.GetFromJsonAsync<JsonElement>("/api/auth/csrf")).GetProperty("token").GetString());var response=await c.SendAsync(request);Assert.Equal(HttpStatusCode.Created,response.StatusCode);Assert.Equal("QA01",(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("number").GetString());
    }
}
