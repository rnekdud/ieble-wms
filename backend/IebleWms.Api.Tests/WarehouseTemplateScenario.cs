using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using Xunit;
namespace IebleWms.Api.Tests;
public static class WarehouseTemplateScenario
{
 public static TemplateDocument Design()=>new(){AspectRatio=1.6,Zones=[new(){Name="Zone",Code="Z"}],Racks=[new(){Name="Rack",Code="R",Levels=3,Bays=4,ZoneIndex=0}],Objects=[new(){Type="zone",Label="Zone",X=.5,Y=.5,Width=.8,Height=.8,ZoneIndex=0},new(){Type="rack",Label="Rack",X=.3,Y=.4,Width=.2,Height=.2,Rotation=90,RackIndex=0},new(){Type="wall",Label="Wall",X=.1,Y=.5,Width=.01,Height=.8}]};
 public static SaveWarehouseWorkspaceRequest Instantiate(TemplateDocument d)
 {
  var zones=d.Zones.Select(x=>new WorkspaceStructureRequest{ClientId=Guid.NewGuid(),Name=x.Name,Code=x.Code}).ToList();
  var racks=d.Racks.Select(x=>new WorkspaceRackRequest{ClientId=Guid.NewGuid(),Name=x.Name,Code=x.Code,Barcode=new(){Mode="none"},Levels=x.Levels,Bays=x.Bays,ZoneClientId=x.ZoneIndex.HasValue?zones[x.ZoneIndex.Value].ClientId:null}).ToList();
  return new(){RequestId=Guid.NewGuid(),Warehouse=new(){Name="Template QA"},Zones=zones,Racks=racks,Plan=new(){AspectRatio=d.AspectRatio,Objects=d.Objects.Select(x=>new PlanObjectDto{Id=Guid.NewGuid(),Type=x.Type,Label=x.Label,X=x.X,Y=x.Y,Width=x.Width,Height=x.Height,Rotation=x.Rotation,Fill=x.Fill,Shape=x.Shape,RackId=x.RackIndex.HasValue?racks[x.RackIndex.Value].ClientId:null,ZoneId=x.ZoneIndex.HasValue?zones[x.ZoneIndex.Value].ClientId:null}).ToList()}};
 }
 public static async Task Run(HttpClient c,string root)
 {
  var endpoint=root+"/warehouse-templates";
  async Task<JsonElement> Get(string p){var r=await c.GetAsync(p);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<JsonElement> Post(string p,object b){var r=await AuthTests.Post(c,p,b);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  var count=(await Get(root+"/warehouses")).GetProperty("total").GetInt32();
  var request=new SaveWarehouseTemplateRequest{RequestId=Guid.NewGuid(),Name="Design-"+Guid.NewGuid(),Document=Design()};
  var t=await Post(endpoint,request);var id=t.GetProperty("id").GetGuid();Assert.Equal(1,t.GetProperty("rackCount").GetInt32());
  Assert.Equal(count,(await Get(root+"/warehouses")).GetProperty("total").GetInt32());Assert.Equal(id,(await Post(endpoint,request)).GetProperty("id").GetGuid());
  var saved=(await Get(endpoint+"/"+id)).GetProperty("document");Assert.DoesNotContain("rackId",saved.ToString());Assert.DoesNotContain("barcode",saved.ToString());Assert.Equal(90,saved.GetProperty("objects")[1].GetProperty("rotation").GetDouble());
  var options=new JsonSerializerOptions(JsonSerializerDefaults.Web);var d=saved.Deserialize<TemplateDocument>(options)!;
  var a=await Post(root+"/warehouses/workspace",Instantiate(d));var b=await Post(root+"/warehouses/workspace",Instantiate(d));
  var ar=a.GetProperty("racks").EnumerateObject().Single().Value.GetGuid();var br=b.GetProperty("racks").EnumerateObject().Single().Value.GetGuid();Assert.NotEqual(ar,br);
  var aw=a.GetProperty("warehouseId").GetGuid();var front=await Get(root+"/warehouses/"+aw+"/racks/"+ar+"/front");Assert.Equal(12,front.GetProperty("locations").GetArrayLength());Assert.Equal(JsonValueKind.Null,front.GetProperty("rack").GetProperty("barcode").ValueKind);
  var before=(await Get(root+"/warehouses/"+aw+"/workspace")).ToString();
  var update=new SaveWarehouseTemplateRequest{RequestId=Guid.NewGuid(),Version=t.GetProperty("version").GetGuid(),Name=request.Name+" renamed",Document=d};
  var changed=await Post(endpoint+"/"+id,update);Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,endpoint+"/"+id,update)).StatusCode);
  Assert.Equal(id,(await Post(endpoint,request)).GetProperty("id").GetGuid());Assert.Equal(before,(await Get(root+"/warehouses/"+aw+"/workspace")).ToString());
  var list=await Get(endpoint+"?search="+Uri.EscapeDataString(update.Name));Assert.Equal(1,list.GetProperty("total").GetInt32());
  await Post(endpoint+"/"+id+"/archive",new{version=changed.GetProperty("version").GetGuid()});Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(endpoint+"/"+id)).StatusCode);Assert.Equal(0,(await Get(endpoint+"?search="+Uri.EscapeDataString(update.Name))).GetProperty("total").GetInt32());Assert.Equal(before,(await Get(root+"/warehouses/"+aw+"/workspace")).ToString());
 }
}
