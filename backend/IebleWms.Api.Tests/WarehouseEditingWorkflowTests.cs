using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using IebleWms.Api.Contracts;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class WarehouseEditingWorkflowTests
{
    [Fact]
    public async Task AggregateEditingPreservesStockLocationsAndBarcodeAfterGeometryAndExpansion()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var password = "Test1!" + Guid.NewGuid().ToString("N");
        await AuthTests.Post(client, "/api/auth/register", new { companyName="Warehouse QA", businessRegistrationNumber="1234512345", contactName="QA", contactPhone="010-1234-5678", email="warehouse-edit@qa.test", password });
        await AuthTests.Post(client, "/api/auth/login", new { email="warehouse-edit@qa.test", password });
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        await WarehouseEditingScenario.Run(client, "/api/tenants/" + me.GetProperty("selectedTenantId").GetGuid());
    }
}

// The same HTTP workflow is run with SQLite tests and the isolated PostgreSQL QA host.
public static class WarehouseEditingScenario
{
    public static async Task Run(HttpClient client, string root)
    {
        async Task<JsonElement> Get(string url) => (await client.GetFromJsonAsync<JsonElement>(url));
        async Task<JsonElement> Post(string url, object body)
        {
            var response = await AuthTests.Post(client,url,body);
            Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }
        string StockSignature(JsonElement response)
        {
            var items=JsonNode.Parse(response.GetProperty("items").GetRawText())!.AsArray();
            foreach(var item in items)item!.AsObject().Remove("warehouseName");
            return items.ToJsonString();
        }
        var suffix=Guid.NewGuid().ToString("N")[..8];
        var zone=new WorkspaceStructureRequest {ClientId=Guid.NewGuid(),Code="Z",Name="구역"};
        var rack=new WorkspaceRackRequest {ClientId=Guid.NewGuid(),Code="R",Name="랙",Levels=3,Bays=4,ZoneClientId=zone.ClientId,Barcode=new(){Mode="manual",Value="EDIT-"+suffix}};
        var request=new SaveWarehouseWorkspaceRequest {RequestId=Guid.NewGuid(),Warehouse=new(){Name="한 번에 저장 "+suffix,Address="QA 주소",ContactName="QA 담당"},Zones=[zone],Racks=[rack],Plan=new(){Objects=[
            new(){Id=Guid.NewGuid(),Type="zone",Label="구역",X=.5,Y=.5,Width=.6,Height=.6,ZoneId=zone.ClientId},
            new(){Id=Guid.NewGuid(),Type="rack",Label="랙",X=.5,Y=.5,Width=.2,Height=.1,RackId=rack.ClientId}
        ]}};
        var result=(await Post(root+"/warehouses/workspace",request)).Deserialize<WarehouseWorkspaceSaved>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        var wroot=root+"/warehouses/"+result.WarehouseId;var rackId=result.Racks[rack.ClientId];var rroot=wroot+"/racks/"+rackId;
        Assert.Equal(12,result.RackLocations.Count);
        var before=await Get(rroot+"/front");var locations=before.GetProperty("locations").EnumerateArray().Select(x=>x.GetProperty("location").GetProperty("id").GetGuid()).ToArray();
        var product=await Post(root+"/products",new{requestId=Guid.NewGuid(),code="EDIT-"+suffix,name="보관 상품",unit="EA"});
        await Post(root+"/inventory/adjust",new{requestId=Guid.NewGuid(),productId=product.GetProperty("id").GetGuid(),warehouseId=result.WarehouseId,locationId=locations[0],quantity=10,increase=true,reason="isolated QA",occurredAt=DateTimeOffset.UtcNow});
        var stockBefore=StockSignature(await Get(rroot+"/stock"));
        var detail=(await Get(wroot+"/workspace")).GetProperty("detail");var plan=await Get(wroot+"/plan");
        request.RequestId=Guid.NewGuid();request.Warehouse.Version=detail.GetProperty("warehouse").GetProperty("version").GetGuid();request.Warehouse.Name="통합 수정 "+suffix;
        zone.Id=zone.ClientId=result.Zones[zone.ClientId];zone.Version=detail.GetProperty("zones")[0].GetProperty("version").GetGuid();
        rack.Id=rack.ClientId=rackId;rack.ZoneClientId=zone.Id;rack.Version=detail.GetProperty("racks")[0].GetProperty("version").GetGuid();rack.Levels=4;rack.Barcode=new(){Mode="keep"};
        // Read DTO has extra metadata; explicitly build the write DTO and retain physical links.
        request.Plan=new(){Version=plan.GetProperty("version").GetGuid(),Objects=plan.GetProperty("objects").Deserialize<List<PlanObjectDto>>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!};
        request.Plan.Objects.Reverse();request.Plan.Objects[0].X=.7;request.Plan.Objects[0].Rotation=90;
        await Post(wroot+"/workspace",request);
        var after=await Get(rroot+"/front");Assert.Equal(16,after.GetProperty("locations").GetArrayLength());
        foreach(var id in locations)Assert.Contains(after.GetProperty("locations").EnumerateArray(),x=>x.GetProperty("location").GetProperty("id").GetGuid()==id);
        Assert.Equal("EDIT-"+suffix,after.GetProperty("rack").GetProperty("barcode").GetString());Assert.Equal(stockBefore,StockSignature(await Get(rroot+"/stock")));
        var saved=await Get(wroot+"/plan");Assert.Equal(rackId,saved.GetProperty("objects")[0].GetProperty("rackId").GetGuid());Assert.Equal(.7,saved.GetProperty("objects")[0].GetProperty("x").GetDouble());
        Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(client,wroot+"/workspace",new SaveWarehouseWorkspaceRequest{RequestId=Guid.NewGuid(),Warehouse=request.Warehouse,Zones=request.Zones,Racks=request.Racks,Plan=request.Plan})).StatusCode);
        Assert.Equal(saved.ToString(),(await Get(wroot+"/plan")).ToString());
    }
}
