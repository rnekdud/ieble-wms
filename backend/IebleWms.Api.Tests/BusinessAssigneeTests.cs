using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed partial class ReceiptTests
{
    [Fact]
    public async Task BusinessAssigneesRespectTenantActiveMembershipAndKeepAuditActor()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        var t = await Seed(f); var s = await Setup(f,t); await Login(c,t);
        Guid reader, foreign;
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            reader=await db.Users.Where(x=>x.UserName=="Reader").Select(x=>x.Id).SingleAsync();
            foreign=await db.Users.Where(x=>x.UserName=="Other").Select(x=>x.Id).SingleAsync();
            var member=await db.TenantMemberships.SingleAsync(x=>x.TenantId==t.Tenant&&x.UserId==reader); member.DisplayName="이영희";
            var department=new Department{TenantId=t.Tenant,Name="물류관리팀",NormalizedName="물류관리팀"};db.Departments.Add(department); member.DepartmentId=department.Id;
            (await db.Users.SingleAsync(x=>x.Id==reader)).Email="logistics@qa.test"; await db.SaveChangesAsync();
        }
        var root=$"/api/tenants/{t.Tenant}";
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var warehouse=await db.Warehouses.SingleAsync(x=>x.Id==s.Warehouse);warehouse.CustomCode="ASSIGNEE-CUSTOM";warehouse.NormalizedCustomCode="ASSIGNEE-CUSTOM";
            var parent=new ProductCategory{TenantId=t.Tenant,Name="QA 상위",NormalizedName="QA 상위"};
            var child=new ProductCategory{TenantId=t.Tenant,Name="QA 중간",NormalizedName="QA 중간",ParentId=parent.Id};
            db.ProductCategories.AddRange(parent,child,new ProductCategory{TenantId=t.Tenant,Name="QA 하위",NormalizedName="QA 하위",ParentId=child.Id});await db.SaveChangesAsync();
        }
        foreach(var route in new[]{"receipts","shipments","reports/stock-overview"}) {
            var warehouses=(await c.GetFromJsonAsync<JsonElement>(root+"/"+route+"/choices?kind=warehouses&search=assignee-custom")).GetProperty("items");Assert.Single(warehouses.EnumerateArray());Assert.Equal(s.Warehouse,warehouses[0].GetProperty("id").GetGuid());
        }
        var categories=(await c.GetFromJsonAsync<JsonElement>(root+"/reports/stock-overview/choices?kind=categories&search="+Uri.EscapeDataString("QA 하위"))).GetProperty("items");Assert.Single(categories.EnumerateArray());Assert.Equal("QA 상위 › QA 중간",categories[0].GetProperty("customCode").GetString());
        var workspace=await c.GetFromJsonAsync<JsonElement>(root+"/workspace");
        Assert.Equal(t.Actor,workspace.GetProperty("currentAssignee").GetProperty("id").GetGuid());
        foreach(var feature in new[]{"receipts","shipments","stocktake","stock-adjustments","warehouses"}) {
            var choices=await c.GetFromJsonAsync<JsonElement>(root+"/assignees/choices?kind="+feature+"&search=Reader");
            Assert.Equal(reader,choices.GetProperty("items")[0].GetProperty("id").GetGuid());
            Assert.Equal("이영희",choices.GetProperty("items")[0].GetProperty("name").GetString());
            Assert.Equal(0,(await c.GetFromJsonAsync<JsonElement>(root+"/assignees/choices?kind="+feature+"&search=Other")).GetProperty("total").GetInt32());
        }
        foreach(var search in new[]{"물류관리팀","logistics@qa.test","이영희","Reader"}) {
            var found=(await c.GetFromJsonAsync<JsonElement>(root+"/assignees/choices?kind=receipts&search="+Uri.EscapeDataString(search))).GetProperty("items");
            Assert.Single(found.EnumerateArray()); Assert.Equal(reader,found[0].GetProperty("id").GetGuid());
            Assert.Equal("물류관리팀",found[0].GetProperty("customCode").GetString()); Assert.Equal("logistics@qa.test",found[0].GetProperty("email").GetString());
        }
        var input=Request(s); input.ContactUserId=reader; input.ContactName="이름 위조";
        var created=await Post(c,t.Root,input); var document=Doc(created); var id=Id(document);
        Assert.Equal(reader,document.GetProperty("contactUserId").GetGuid()); Assert.Equal("이영희",document.GetProperty("contactName").GetString());
        Assert.Equal(t.Actor,document.GetProperty("createdByUserId").GetGuid());
        var automatic=await Post(c,t.Root,Request(s));Assert.Equal(t.Actor,Doc(automatic).GetProperty("contactUserId").GetGuid());
        foreach(var invalid in new[]{foreign,Guid.NewGuid()}) {var bad=Request(s);bad.ContactUserId=invalid;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,bad)).StatusCode);}
        input.Version=Version(document);input.ContactUserId=t.Actor;
        var updated=await Post(c,t.Root+"/"+id,input,HttpStatusCode.OK);Assert.Equal(t.Actor,Doc(updated).GetProperty("contactUserId").GetGuid());
        input.Version=Version(Doc(updated));input.ContactUserId=reader;updated=await Post(c,t.Root+"/"+id,input,HttpStatusCode.OK);
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.TenantMemberships.SingleAsync(x=>x.TenantId==t.Tenant&&x.UserId==reader)).IsActive=false;await db.SaveChangesAsync();
        }
        var hidden=await c.GetFromJsonAsync<JsonElement>(root+"/assignees/choices?kind=receipts&search=Reader");Assert.Equal(0,hidden.GetProperty("total").GetInt32());
        var historic=await c.GetFromJsonAsync<JsonElement>(root+$"/assignees/{reader}?kind=receipts");Assert.Equal("물류관리팀",historic.GetProperty("customCode").GetString());Assert.Equal("logistics@qa.test",historic.GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+$"/assignees/{foreign}?kind=receipts")).StatusCode);
        var badActive=Request(s);badActive.ContactUserId=reader;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,t.Root,badActive)).StatusCode);
        input.Version=Version(Doc(updated));input.ContactName="임의 변경";
        updated=await Post(c,t.Root+"/"+id,input,HttpStatusCode.OK);Assert.Equal("이영희",Doc(updated).GetProperty("contactName").GetString());
        input.Version=Version(Doc(updated));input.ContactUserId=null;
        updated=await Post(c,t.Root+"/"+id,input,HttpStatusCode.OK);Assert.Equal(reader,Doc(updated).GetProperty("contactUserId").GetGuid());
        using(var scope=f.Services.CreateScope()) {
            var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            Assert.All(await db.ReceiptChanges.Where(x=>x.ReceiptId==id).ToListAsync(),x=>Assert.Equal(t.Actor,x.ActorId));
            Assert.Contains(await db.ReceiptChanges.Where(x=>x.ReceiptId==id).ToListAsync(),x=>x.Action=="Updated"&&x.AfterJson.Contains(reader.ToString()));
            var legacy=await db.InboundReceipts.SingleAsync(x=>x.Id==id);legacy.ContactUserId=null;legacy.ContactName="과거 담당자";await db.SaveChangesAsync();input.Version=legacy.Version;
        }
        updated=await Post(c,t.Root+"/"+id,input,HttpStatusCode.OK);Assert.Equal("과거 담당자",Doc(updated).GetProperty("contactName").GetString());
        using var outsider=f.Client();await Login(outsider,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await outsider.GetAsync(root+$"/assignees/{reader}?kind=receipts")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await outsider.GetAsync(root+"/assignees/choices?kind=receipts")).StatusCode);
    }

    [Fact]
    public async Task BusinessAssigneesApplyToShipmentStocktakeWarehouseAndInventoryWithoutReplacingActor()
    {
        using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
        Guid member,foreign;
        using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();member=await db.Users.Where(x=>x.UserName=="Reader").Select(x=>x.Id).SingleAsync();foreign=await db.Users.Where(x=>x.UserName=="Other").Select(x=>x.Id).SingleAsync();}
        var root=$"/api/tenants/{t.Tenant}";
        var ready=await Ready(c,t,s);await Post(c,t.Root+"/"+Id(Doc(ready))+"/confirm",new{version=Version(Doc(ready))},HttpStatusCode.OK);
        var shipment=new ShipmentRequest{RequestId=Guid.NewGuid(),WarehouseId=s.Warehouse,PartnerId=s.Partner,RequestDate=new(2026,11,1),ExpectedDate=new(2026,11,2),ContactUserId=member,Lines=[new(){ProductId=s.Bulk,RequestedQuantity=1}]};
        var sd=await Post(c,root+"/shipments",shipment);Assert.Equal(member,sd.GetProperty("shipment").GetProperty("contactUserId").GetGuid());
        shipment.RequestId=Guid.NewGuid();shipment.ContactUserId=foreign;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root+"/shipments",shipment)).StatusCode);
        var count=new StocktakeRequest{RequestId=Guid.NewGuid(),WarehouseId=s.Warehouse,Name="담당 실사",BasisAt=DateTimeOffset.UtcNow,ContactUserId=member};
        var st=await Post(c,root+"/stocktakes",count);Assert.Equal(member,st.GetProperty("document").GetProperty("contactUserId").GetGuid());
        count.RequestId=Guid.NewGuid();count.ContactUserId=foreign;Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root+"/stocktakes",count)).StatusCode);
        var wh=await Post(c,root+"/warehouses",new{name="담당 창고",contactUserId=member});Assert.Equal(member,wh.GetProperty("contactUserId").GetGuid());
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root+"/warehouses",new{name="차단 창고",contactUserId=foreign})).StatusCode);
        var stock=(await c.GetFromJsonAsync<JsonElement>(root+"/inventory?productId="+s.Bulk)).GetProperty("items")[0];
        var adjustment=new InventoryRequest{RequestId=Guid.NewGuid(),StockId=Id(stock),Version=Version(stock),Quantity=1,OccurredAt=DateTimeOffset.UtcNow,Reason="담당 검증",ContactUserId=member,Increase=true};
        var op=await Post(c,root+"/inventory/adjust",adjustment);Assert.Equal(member,op.GetProperty("operation").GetProperty("contactUserId").GetGuid());Assert.Equal(t.Actor,op.GetProperty("operation").GetProperty("actorId").GetGuid());
        adjustment.RequestId=Guid.NewGuid();adjustment.ContactUserId=foreign;stock=(await c.GetFromJsonAsync<JsonElement>(root+"/inventory?productId="+s.Bulk)).GetProperty("items")[0];adjustment.Version=Version(stock);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root+"/inventory/adjust",adjustment)).StatusCode);
    }
}
