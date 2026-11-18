using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
namespace IebleWms.Api.Tests;
public static class WarehouseDashboardScenario
{
 public static async Task Run(HttpClient c,string root,IServiceProvider services)
 {
  static Guid Id(JsonElement x)=>x.GetProperty("id").GetGuid();
  async Task<JsonElement> Get(string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<JsonElement> Post(string path,object body){var r=await AuthTests.Post(c,path,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  var suffix=Guid.NewGuid().ToString("N")[..8];
  var w=await Post(root+"/warehouses",new{name="Map warehouse"});var wid=Id(w);var wr=root+"/warehouses/"+wid;var endpoint=root+"/dashboard/warehouses/"+wid;
  Assert.False((await Get(endpoint)).GetProperty("plan").GetProperty("exists").GetBoolean());
  var rack=await Post(wr+"/racks",new{code="R1",name="Rack",levels=2,bays=2,barcode=new{mode="manual",value="MAP-"+suffix}});var rid=Id(rack);
  var front=await Get(wr+"/racks/"+rid+"/front");var locations=front.GetProperty("locations").EnumerateArray().Select(l=>Id(l.GetProperty("location"))).ToArray();
  var p=await Post(root+"/products",new{requestId=Guid.NewGuid(),code="MAP-EA-"+suffix,name="EA product",unit="EA",lotManaged=true});
  var kg=await Post(root+"/products",new{requestId=Guid.NewGuid(),code="MAP-KG-"+suffix,name="kg product",unit="EA"});
  await LegacyUnitFixture.Set(services,Id(kg),"kg");
  foreach(var (product,location,qty,lot) in new[]{(Id(p),locations[0],10m,"LOT-A"),(Id(p),locations[0],3m,"LOT-B"),(Id(p),locations[1],2m,"LOT-C"),(Id(kg),locations[0],4.5m,(string?)null)})
   await Post(root+"/inventory/adjust",new{requestId=Guid.NewGuid(),productId=product,warehouseId=wid,locationId=location,quantity=qty,lotNumber=lot,increase=true,occurredAt=DateTimeOffset.UtcNow,reason="Isolated dashboard QA"});
  var partner=(await Post(root+"/partners",new{requestId=Guid.NewGuid(),code="MAP-"+suffix,name="QA",type="BOTH"})).GetProperty("partner");
  var shipment=await Post(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate=DateOnly.FromDateTime(DateTime.UtcNow),expectedDate=DateOnly.FromDateTime(DateTime.UtcNow),partnerId=Id(partner),warehouseId=wid,contactName="QA",lines=new[]{new{productId=Id(p),requestedQuantity=3}}});
  await Post(wr+"/plan",new{version=Guid.Empty,schemaVersion=1,aspectRatio=1.5,objects=new[]{new{id=Guid.NewGuid(),type="rack",label="Rack",x=.3,y=.5,width=.2,height=.15,rotation=90,fill="#a7ccdf",shape="rectangle",rackId=rid}}});
  var before=(await Get(wr+"/workspace")).ToString();
  var data=await Get(endpoint+"?rackId="+rid+"&locationId="+locations[0]);var summary=data.GetProperty("warehouse");
  Assert.Equal(2,summary.GetProperty("products").GetInt32());Assert.Equal(1,summary.GetProperty("holdingRacks").GetInt32());Assert.Equal(4,summary.GetProperty("locations").GetInt32());Assert.Equal(2,summary.GetProperty("holdingLocations").GetInt32());Assert.True(summary.GetProperty("reservedLocations").GetInt32()>0);
  var racks=data.GetProperty("racks");Assert.Equal(2,racks[0].GetProperty("products").GetInt32());Assert.Equal(2,racks[0].GetProperty("holdingLocations").GetInt32());
  var totals=data.GetProperty("totals").EnumerateArray().ToArray();Assert.Equal(2,totals.Length);Assert.Equal(15,totals.Single(x=>x.GetProperty("unit").GetString()=="EA").GetProperty("quantity").GetDecimal());Assert.Equal(4.5m,totals.Single(x=>x.GetProperty("unit").GetString()=="kg").GetProperty("quantity").GetDecimal());
  Assert.Equal(3,totals.Single(x=>x.GetProperty("unit").GetString()=="EA").GetProperty("reservedQuantity").GetDecimal());
  var detail=data.GetProperty("detail");Assert.Equal(locations,detail.GetProperty("front").GetProperty("locations").EnumerateArray().Select(l=>Id(l.GetProperty("location"))));
  Assert.Equal(3,detail.GetProperty("stock").GetProperty("total").GetInt32());Assert.All(detail.GetProperty("stock").GetProperty("items").EnumerateArray(),x=>Assert.Equal(locations[0],x.GetProperty("locationId").GetGuid()));
  Assert.Equal(0,(await Get(endpoint+"?rackId="+rid+"&locationId="+locations[3])).GetProperty("detail").GetProperty("stock").GetProperty("total").GetInt32());
  Assert.Equal(0,(await Get(endpoint+"?rackId="+rid+"&page=2")).GetProperty("detail").GetProperty("stock").GetProperty("items").GetArrayLength());
  Assert.Equal(System.Net.HttpStatusCode.NotFound,(await c.GetAsync(endpoint+"?rackId="+rid+"&locationId="+Guid.NewGuid())).StatusCode);
  Assert.Equal(before,(await Get(wr+"/workspace")).ToString());
  await Post(root+"/shipments/"+Id(shipment.GetProperty("shipment"))+"/cancel",new{version=shipment.GetProperty("shipment").GetProperty("version").GetGuid()});
  var refreshed=await Get(endpoint);Assert.Equal(0,refreshed.GetProperty("warehouse").GetProperty("reservedLocations").GetInt32());
  Assert.Equal((await Get(wr+"/plan")).ToString(),refreshed.GetProperty("plan").ToString());
  Assert.Contains((await Get(root+"/dashboard/warehouses")).GetProperty("warehouses").EnumerateArray(),x=>Id(x)==wid&&x.GetProperty("products").GetInt32()==2);
 }
}
