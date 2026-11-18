using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class WarehouseWorkspaceTests
{
 [Fact] public async Task TemplatesRoundtripWithoutCreatingWarehousesAndCloneFreshIdentities(){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await WarehouseTemplateScenario.Run(c,$"/api/tenants/{t.Tenant}");using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(3,await db.OrganizationChanges.CountAsync(x=>x.Action.StartsWith("WarehouseTemplate")));}
 [Fact] public async Task TemplatesRejectForeignAccessAndStaffWrites(){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var path=$"/api/tenants/{t.Tenant}/warehouse-templates";var r=new SaveWarehouseTemplateRequest{RequestId=Guid.NewGuid(),Name="Private",Document=WarehouseTemplateScenario.Design()};var response=await AuthTests.Post(c,path,r);var saved=await response.Content.ReadFromJsonAsync<JsonElement>();var id=saved.GetProperty("id").GetGuid();Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync($"/api/tenants/{t.Foreign}/warehouse-templates/{id}")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(path+"/"+Guid.NewGuid())).StatusCode);using var employee=f.Client();await Login(employee,t,"Employee");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(employee,path,r)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(employee,path+"/"+id,r)).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(employee,path+"/"+id+"/archive",new{version=saved.GetProperty("version")})).StatusCode);}
 [Theory][InlineData("rackId")][InlineData("locationId")][InlineData("barcode")][InlineData("stockId")]
 public async Task TemplatesRejectPhysicalFields(string field){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var node=System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(new SaveWarehouseTemplateRequest{RequestId=Guid.NewGuid(),Name="Invalid",Document=WarehouseTemplateScenario.Design()},new JsonSerializerOptions(JsonSerializerDefaults.Web)))!;node["document"]!["objects"]![1]![field]=Guid.NewGuid().ToString();Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,$"/api/tenants/{t.Tenant}/warehouse-templates",node)).StatusCode);}
 [Theory][InlineData("index")][InlineData("capacity")][InlineData("duplicate")][InlineData("null")]
 public async Task TemplatesRejectInvalidStructure(string kind){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);var d=WarehouseTemplateScenario.Design();if(kind=="index")d.Objects[1].RackIndex=7;if(kind=="capacity"){d.Racks[0].Levels=100;d.Racks[0].Bays=100;}if(kind=="duplicate")d.Objects=[d.Objects[1],d.Objects[1]];if(kind=="null")d.Objects=[null!];Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,$"/api/tenants/{t.Tenant}/warehouse-templates",new SaveWarehouseTemplateRequest{RequestId=Guid.NewGuid(),Name="Invalid",Document=d})).StatusCode);}
}
