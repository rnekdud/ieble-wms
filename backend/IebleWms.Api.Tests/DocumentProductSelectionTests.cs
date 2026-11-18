using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed partial class ShipmentTests
{
    [Fact] public async Task DocumentProductSelection() { using var f = new AuthFactory(); using var c = f.Client(); await SelectionScenario(f,c,false); }
    [ScanPostgresFact] public async Task PostgresDocumentProductSelection() { using var f = new ScanPostgresFactory(); using var c = f.Client(); await SelectionScenario(f,c,true); }
    static async Task SelectionScenario(WebApplicationFactory<Program> f, HttpClient c, bool postgres)
    {
        var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        var png=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
        Guid category,kind,first,foreignProduct;
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var cat=new ProductCategory{TenantId=t.Tenant,Name="식품",NormalizedName="식품"};
            var child=new ProductCategory{TenantId=t.Tenant,Name="간식",NormalizedName="간식",ParentId=cat.Id};
            var type=new ProductType{TenantId=t.Tenant,Name="완제품",NormalizedName="완제품"};
            db.AddRange(cat,child,type);category=cat.Id;kind=type.Id;first=Guid.Empty;
            for(var i=0;i<25;i++)
            {
                var p=new Product{TenantId=t.Tenant,Code=$"QA-{i:00}",NormalizedCode=$"QA-{i:00}",Name=$"선택 상품 {i:00}",Unit="EA",ProductTypeId=type.Id,CategoryId=child.Id,CreationRequestId=Guid.NewGuid(),CostPrice=100};db.Add(p);
                if(i==0){first=p.Id;db.AddRange(new StorageBarcode{TenantId=t.Tenant,ProductId=p.Id,Value="SELECT-PRIMARY",IsPrimary=true},new StorageBarcode{TenantId=t.Tenant,ProductId=p.Id,Value="SELECT-SECONDARY"},new ProductImage{TenantId=t.Tenant,ProductId=p.Id,Content=png,ContentType="image/png",FileName="sample.png",IsPrimary=true,Position=0});p.HasImage=true;}
            }
            var foreign=new Product{TenantId=t.Other,Code="SECRET",NormalizedCode="SECRET",Name="다른 기업 상품",Unit="EA",CreationRequestId=Guid.NewGuid()};db.Add(foreign);foreignProduct=foreign.Id;
            db.Add(new Product{TenantId=t.Tenant,Code="OFF",NormalizedCode="OFF",Name="사용 중지 상품",Unit="EA",IsActive=false,CreationRequestId=Guid.NewGuid()});
            await db.SaveChangesAsync();
        }
        async Task<JsonElement> Get(string url) { var r=await c.GetAsync(url);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>(); }
        async Task<JsonElement> Products(string doc,string query="")=>await Get($"/api/tenants/{t.Tenant}/{doc}/choices?kind=product-table&warehouseId={s.Warehouse}&{query}");
        async Task<string> Snapshot()
        {
            using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            return JsonSerializer.Serialize(new { stock=await db.StockBalances.OrderBy(x=>x.Id).ToListAsync(),receipts=await db.InboundReceipts.OrderBy(x=>x.Id).ToListAsync(),shipments=await db.OutboundShipments.OrderBy(x=>x.Id).ToListAsync(),allocations=await db.ShipmentAllocations.OrderBy(x=>x.Id).ToListAsync(),ledger=await db.StockMovements.CountAsync(),audit=await db.ShipmentChanges.CountAsync() });
        }
        var before=await Snapshot();
        foreach(var doc in new[]{"receipts","shipments"})
        {
            var page1=await Products(doc,$"categoryId={category}&productTypeId={kind}");var page2=await Products(doc,$"categoryId={category}&productTypeId={kind}&page=2");
            Assert.Equal(25,page1.GetProperty("total").GetInt32());Assert.Equal(20,page1.GetProperty("items").GetArrayLength());Assert.Equal(5,page2.GetProperty("items").GetArrayLength());
            Assert.Empty(page1.GetProperty("items").EnumerateArray().Select(Id).Intersect(page2.GetProperty("items").EnumerateArray().Select(Id)));
            foreach(var term in new[]{"QA-00","선택 상품 00","SELECT-PRIMARY","SELECT-SECONDARY"})
            {var p=Assert.Single((await Products(doc,"search="+Uri.EscapeDataString(term))).GetProperty("items").EnumerateArray());Assert.Equal(first,Id(p));Assert.Equal("EA",p.GetProperty("unit").GetString());Assert.Equal("SELECT-PRIMARY",p.GetProperty("barcode").GetString());Assert.True(p.GetProperty("hasImage").GetBoolean());Assert.False(p.TryGetProperty("costPrice",out _));}
            Assert.Equal(0,(await Products(doc,"search=OFF")).GetProperty("total").GetInt32());Assert.Equal(0,(await Products(doc,$"ids={foreignProduct}")).GetProperty("total").GetInt32());
            var image=await c.GetAsync($"/api/tenants/{t.Tenant}/{doc}/products/{first}/image");Assert.Equal(HttpStatusCode.OK,image.StatusCode);Assert.Equal(png,await image.Content.ReadAsByteArrayAsync());
            var options=await Get($"/api/tenants/{t.Tenant}/{doc}/choices?kind=product-options");Assert.Equal(2,options.GetProperty("categories").GetArrayLength());Assert.Single(options.GetProperty("productTypes").EnumerateArray());
            Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync($"/api/tenants/{t.Tenant}/{doc}/choices?kind=product-table&pageSize=200&warehouseId={s.Warehouse}")).StatusCode);
        }
        Assert.Equal(before,await Snapshot()); // Selecting/searching/image loading cannot save or reserve.
        var receipt=new ReceiptRequest{RequestId=Guid.NewGuid(),ExpectedDate=new(2026,11,4),WarehouseId=s.Warehouse,PartnerId=s.Partner,ContactName="QA",Lines=[new(){ProductId=first,ExpectedQuantity=2,LotNumber="LOT-A"},new(){ProductId=first,ExpectedQuantity=3,LotNumber="LOT-B"}]};
        var inbound=await Post(c,t.Root,receipt);var receiptId=Id(Doc(inbound));Assert.Equal(2,inbound.GetProperty("lines").GetArrayLength());
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());}
        receipt.Version=Version(Doc(inbound));inbound=await Post(c,t.Root+"/"+receiptId,receipt,HttpStatusCode.OK);Assert.Equal(receiptId,Id(Doc(inbound)));
        inbound=await Post(c,t.Root+"/"+receiptId+"/start-inspection",new{version=Version(Doc(inbound))},HttpStatusCode.OK);
        inbound=await Post(c,t.Root+"/"+receiptId+"/inspection",new{version=Version(Doc(inbound)),lines=inbound.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),quantity=l.GetProperty("expectedQuantity").GetDecimal(),lotNumber=l.GetProperty("lotNumber").GetString()})},HttpStatusCode.OK);
        inbound=await Post(c,t.Root+"/"+receiptId+"/placements",new{version=Version(Doc(inbound)),lines=inbound.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),placements=new[]{new{locationId=s.Location,quantity=l.GetProperty("expectedQuantity").GetDecimal()}}})},HttpStatusCode.OK);
        await Post(c,t.Root+"/"+receiptId+"/confirm",new{version=Version(Doc(inbound))},HttpStatusCode.OK);
        await Post(c,$"/api/tenants/{t.Tenant}/inventory/adjust",new InventoryRequest{RequestId=Guid.NewGuid(),ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=s.Location,Quantity=100,Increase=true,Reason="Isolated product selection QA",OccurredAt=DateTimeOffset.UtcNow});
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var off=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="OFF",Name="비활성",IsActive=false};db.Add(off);
            db.Add(new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=off.Id,ProductId=s.Bulk,Quantity=500,Unit="kg",SourceKey="QA-INACTIVE"});await db.SaveChangesAsync();
        }
        var stockOptions=(await Get($"{Root(t)}/stock?warehouseId={s.Warehouse}&productId={s.Bulk}")).GetProperty("items").EnumerateArray().ToArray();
        Assert.True(stockOptions.Single(x=>x.GetProperty("quantity").GetDecimal()==100).GetProperty("isActive").GetBoolean());
        Assert.False(stockOptions.Single(x=>x.GetProperty("locationCode").GetString()=="OFF").GetProperty("isActive").GetBoolean());
        var original=await Post(c,Root(t),OutRequest(s,30));
        var row=Assert.Single((await Products("shipments",$"ids={s.Bulk}")).GetProperty("items").EnumerateArray());Assert.Equal(100,row.GetProperty("physical").GetDecimal());Assert.Equal(30,row.GetProperty("reserved").GetDecimal());Assert.Equal(70,row.GetProperty("available").GetDecimal());
        var edit=Assert.Single((await Products("shipments",$"ids={s.Bulk}&shipmentId={Id(Shipment(original))}")).GetProperty("items").EnumerateArray());Assert.Equal(100,edit.GetProperty("requestable").GetDecimal());Assert.Equal(30,edit.GetProperty("ownReserved").GetDecimal());
        before=await Snapshot();await Products("shipments",$"ids={s.Bulk}&ids={first}");Assert.Equal(before,await Snapshot());
        var duplicated=OutRequest(s,40);duplicated.Lines=[new(){ProductId=s.Bulk,RequestedQuantity=40},new(){ProductId=s.Bulk,RequestedQuantity=40}];
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t),duplicated)).StatusCode);Assert.Equal(before,await Snapshot());
        duplicated.RequestId=Guid.NewGuid();duplicated.Lines[0].RequestedQuantity=20;duplicated.Lines[1].RequestedQuantity=10;var outgoing=await Post(c,Root(t),duplicated);Assert.Equal(2,outgoing.GetProperty("lines").GetArrayLength());
        var update=OutRequest(s,35);update.Version=Version(Shipment(original));update.Lines=[new(){ProductId=s.Bulk,RequestedQuantity=35},new(){ProductId=s.Bulk,RequestedQuantity=5}];original=await Post(c,Root(t)+"/"+Id(Shipment(original)),update,HttpStatusCode.OK);
        outgoing=await Action(c,t,outgoing,"start-picking");outgoing=await Work(c,t,outgoing,"picking");outgoing=await Work(c,t,outgoing,"inspection");await Action(c,t,outgoing,"confirm");
        await Action(c,t,original,"cancel");
        row=Assert.Single((await Products("shipments",$"ids={s.Bulk}")).GetProperty("items").EnumerateArray());Assert.Equal(70,row.GetProperty("available").GetDecimal());
        if(postgres)
        {
            var races=await Task.WhenAll(AuthTests.Post(c,Root(t),OutRequest(s,60)),AuthTests.Post(c,Root(t),OutRequest(s,60)));
            var winner=Assert.Single(races,r=>r.StatusCode==HttpStatusCode.Created);Assert.Single(races,r=>r.StatusCode==HttpStatusCode.Conflict);
            await Action(c,t,await winner.Content.ReadFromJsonAsync<JsonElement>(),"cancel");
        }
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var grants=PermissionCatalog.Defaults();grants["Employee"]["products"]=[];
            db.Add(new TenantPermissionSettings{TenantId=t.Tenant,RolesJson=JsonSerializer.Serialize(grants),UpdatedByUserId=t.Actor});await db.SaveChangesAsync();
        }
        await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Tenant}/products")).StatusCode);
        await Products("receipts");await Products("shipments");Assert.Equal(HttpStatusCode.OK,(await c.GetAsync(t.Root+$"/products/{first}/image")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,t.Root,receipt)).StatusCode);
        using(var scope=f.Services.CreateScope())
        {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var settings=await db.TenantPermissionSettings.SingleAsync(x=>x.TenantId==t.Tenant);var grants=PermissionCatalog.Defaults();grants["Employee"]["receipts"]=[];grants["Employee"]["shipments"]=[];settings.RolesJson=JsonSerializer.Serialize(grants);await db.SaveChangesAsync();
        }
        foreach(var doc in new[]{"receipts","shipments"}) { Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Tenant}/{doc}/choices?kind=product-table&warehouseId={s.Warehouse}")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Tenant}/{doc}/products/{first}/image")).StatusCode); }
        await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(t.Root+"/choices?kind=product-options")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/receipts/products/{first}/image")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync($"/api/tenants/{t.Other}/shipments/choices?kind=product-table&warehouseId="+(await Get($"/api/tenants/{t.Other}/shipments/choices?kind=warehouses")).GetProperty("items")[0].GetProperty("id").GetGuid()+$"&shipmentId={Id(Shipment(original))}")).StatusCode);
        var output=Environment.GetEnvironmentVariable("WMS_SELECTION_QA_FIXTURE");
        if(postgres&&!string.IsNullOrEmpty(output))await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,warehouse=s.Warehouse,partner=s.Partner,bulk=s.Bulk,product=first,category,kind,receipt=receiptId}));
    }
}
