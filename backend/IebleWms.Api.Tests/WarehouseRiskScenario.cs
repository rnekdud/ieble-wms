using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
namespace IebleWms.Api.Tests;
// The same real API scenario runs on isolated SQLite and PostgreSQL; no production fixture writes.
public static class WarehouseRiskScenario
{
 public static async Task Run(HttpClient c,string root,IServiceProvider services)
 {
  static Guid Id(JsonElement x)=>x.GetProperty("id").GetGuid();
  async Task<JsonElement> Get(string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<JsonElement> Post(string path,object body){var r=await AuthTests.Post(c,path,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  var suffix=Guid.NewGuid().ToString("N")[..8];var w=await Post(root+"/warehouses",new{name="Risk "+suffix});var other=await Post(root+"/warehouses",new{name="Split "+suffix});var wid=Id(w);var endpoint=root+"/dashboard/warehouses/"+wid;
  var today=DateOnly.Parse((await Get(endpoint)).GetProperty("risk").GetProperty("today").GetString()!);
  async Task<(Guid rack,Guid location)> Rack(Guid warehouse,string code){var r=await Post(root+"/warehouses/"+warehouse+"/racks",new{code,name=code,levels=1,bays=1});var f=await Get(root+"/warehouses/"+warehouse+"/racks/"+Id(r)+"/front");return(Id(r),Id(f.GetProperty("locations")[0].GetProperty("location")));}
  var a=await Rack(wid,"A");var b=await Rack(wid,"B");var outside=await Rack(Id(other),"C");var empty=await Rack(wid,"EMPTY");
  async Task<JsonElement> Product(string name,decimal? safety,string unit="EA"){var p=await Post(root+"/products",new{requestId=Guid.NewGuid(),name=name+suffix,safetyStock=safety,unit="EA"});if(unit!="EA")await LegacyUnitFixture.Set(services,Id(p),unit);return p;}
  var p=await Product("Risk50",40);var kg=await Product("kg",0,"kg");
  async Task Stock(JsonElement product,Guid warehouse,Guid location,decimal quantity,string? lot=null,DateOnly? expiry=null)=>_ =await Post(root+"/inventory/adjust",new{requestId=Guid.NewGuid(),productId=Id(product),warehouseId=warehouse,locationId=location,quantity,lotNumber=lot,expiryDate=expiry,increase=true,reason="Isolated risk QA",occurredAt=DateTimeOffset.UtcNow});
  await Stock(p,wid,a.location,30,"A");await Stock(p,wid,b.location,10,"B");await Stock(p,Id(other),outside.location,10,"C");await Stock(kg,wid,b.location,5.5m);
  static JsonElement Risk(JsonElement d)=>d.GetProperty("risk");
  static JsonElement RackState(JsonElement d,Guid id)=>Risk(d).GetProperty("racks").EnumerateArray().Single(x=>Id(x)==id);
  Assert.Equal("safe",RackState(await Get(endpoint),a.rack).GetProperty("status").GetString());Assert.Equal("empty",RackState(await Get(endpoint),empty.rack).GetProperty("status").GetString());
  var partner=(await Post(root+"/partners",new{requestId=Guid.NewGuid(),code="RISK-"+suffix,name="Risk partner",type="BOTH"})).GetProperty("partner");
  async Task<JsonElement> Out(DateOnly date,decimal quantity)=>await Post(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate=today,expectedDate=date,partnerId=Id(partner),warehouseId=wid,contactName="QA",lines=new[]{new{productId=Id(p),requestedQuantity=quantity,lotNumber="A"}}});
  var ship=await Out(today.AddDays(1),20);var snapshot=await Get(endpoint+"?rackId="+a.rack);var issue=Risk(snapshot).GetProperty("detail").GetProperty("items")[0];
  Assert.Equal("danger",RackState(snapshot,a.rack).GetProperty("status").GetString());Assert.Equal(50,issue.GetProperty("currentQuantity").GetDecimal());Assert.Equal(20,issue.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(30,issue.GetProperty("expectedQuantity").GetDecimal());Assert.Equal(10,issue.GetProperty("shortageQuantity").GetDecimal());Assert.Equal(30,issue.GetProperty("rackQuantity").GetDecimal());Assert.Equal(20,issue.GetProperty("rackReservedQuantity").GetDecimal());Assert.Equal(today.AddDays(1).ToString("yyyy-MM-dd"),issue.GetProperty("reservations")[0].GetProperty("date").GetString());
  var second=Risk(await Get(endpoint+"?rackId="+b.rack)).GetProperty("detail").GetProperty("items")[0];Assert.Equal(50,second.GetProperty("currentQuantity").GetDecimal());Assert.Equal(10,second.GetProperty("shortageQuantity").GetDecimal());Assert.Equal(0,second.GetProperty("rackReservedQuantity").GetDecimal());Assert.Equal("danger",RackState(await Get(root+"/dashboard/warehouses/"+Id(other)),outside.rack).GetProperty("status").GetString());
  var low=Risk(await Get(endpoint+"?riskKind=shortage")).GetProperty("alerts");
  Assert.Equal(1,Risk(await Get(endpoint)).GetProperty("lowProducts").GetInt32());
  Assert.Equal(2,low.GetProperty("total").GetInt32());
  Assert.All(low.GetProperty("items").EnumerateArray(),x=>{Assert.Equal(10,x.GetProperty("risk").GetProperty("shortageQuantity").GetDecimal());Assert.Equal(wid,x.GetProperty("stock").GetProperty("warehouseId").GetGuid());});
  Assert.Equal(System.Net.HttpStatusCode.BadRequest,(await c.GetAsync(endpoint+"?riskKind=invalid")).StatusCode);
  var cancel=await Out(today,5);Assert.Equal(1,Risk(await Get(endpoint)).GetProperty("todayShipments").GetInt32());await Post(root+"/shipments/"+Id(cancel.GetProperty("shipment"))+"/cancel",new{version=cancel.GetProperty("shipment").GetProperty("version").GetGuid()});Assert.Equal(0,Risk(await Get(endpoint)).GetProperty("todayShipments").GetInt32());
  var scheduled=await Post(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate=today,expectedDate=today,partnerId=Id(partner),warehouseId=wid,contactName="QA",lines=new[]{new{productId=Id(kg),requestedQuantity=.5m},new{productId=Id(kg),requestedQuantity=.25m}}});
  var incoming=await Post(root+"/receipts",new{requestId=Guid.NewGuid(),expectedDate=today,partnerId=Id(partner),warehouseId=wid,contactName="QA",lines=new[]{new{productId=Id(p),expectedQuantity=7m},new{productId=Id(kg),expectedQuantity=3.5m}}});
  await Post(root+"/receipts",new{requestId=Guid.NewGuid(),expectedDate=today.AddDays(1),partnerId=Id(partner),warehouseId=wid,contactName="QA",lines=new[]{new{productId=Id(p),expectedQuantity=7m}}});
  var pending=await Get(endpoint+"/scheduled-receipts");Assert.Equal(1,pending.GetProperty("total").GetInt32());Assert.Equal(2,pending.GetProperty("documents")[0].GetProperty("lines").GetArrayLength());Assert.Equal(Id(incoming.GetProperty("receipt")),Id(pending.GetProperty("documents")[0]));Assert.Equal(1,(await Get(endpoint+"/scheduled-shipments")).GetProperty("total").GetInt32());
  // Confirm the 20-unit reservation; expected stock must stay 30 rather than incorrectly becoming 10.
  var shipUrl=root+"/shipments/"+Id(ship.GetProperty("shipment"));ship=await Post(shipUrl+"/start-picking",new{version=ship.GetProperty("shipment").GetProperty("version").GetGuid()});
  foreach(var action in new[]{"picking","inspection"})ship=await Post(shipUrl+"/"+action,new{version=ship.GetProperty("shipment").GetProperty("version").GetGuid(),complete=true,allocations=ship.GetProperty("allocations").EnumerateArray().Select(x=>new{allocationId=Id(x),quantity=x.GetProperty("quantity").GetDecimal()})});
  await Post(shipUrl+"/confirm",new{version=ship.GetProperty("shipment").GetProperty("version").GetGuid()});
  issue=Risk(await Get(endpoint+"?rackId="+a.rack)).GetProperty("detail").GetProperty("items")[0];Assert.Equal(30,issue.GetProperty("currentQuantity").GetDecimal());Assert.Equal(0,issue.GetProperty("reservedQuantity").GetDecimal());Assert.Equal(30,issue.GetProperty("expectedQuantity").GetDecimal());Assert.Equal(10,issue.GetProperty("shortageQuantity").GetDecimal());
  foreach(var (days,status) in new[]{(-1,"danger"),(0,"warning"),(30,"warning"),(31,"safe")}){var r=await Rack(wid,"EXP"+days);var e=await Product("Expiry"+days,0);await Stock(e,wid,r.location,2,"LOT"+days,today.AddDays(days));var view=await Get(endpoint+"?rackId="+r.rack);Assert.Equal(status,RackState(view,r.rack).GetProperty("status").GetString());Assert.Equal(days<=30?1:0,Risk(view).GetProperty("detail").GetProperty("expiry").GetProperty("total").GetInt32());if(days==0)await Stock(e,wid,r.location,1,"SECOND-LOT",today);}
  var expiration=Risk(await Get(endpoint+"?riskKind=expiry"));Assert.Equal(3,expiration.GetProperty("expiryProducts").GetInt32());Assert.Equal(4,expiration.GetProperty("alerts").GetProperty("total").GetInt32());
  Assert.Contains(expiration.GetProperty("alerts").GetProperty("items").EnumerateArray(),x=>x.GetProperty("remainingDays").GetInt32()==-1);
  var unknown=await Rack(wid,"UNKNOWN");var near=await Rack(wid,"NEAR");await Stock(await Product("unset",null),wid,unknown.location,5);await Stock(await Product("near",10),wid,near.location,11);Assert.Equal("review",RackState(await Get(endpoint),unknown.rack).GetProperty("status").GetString());Assert.Equal("warning",RackState(await Get(endpoint),near.rack).GetProperty("status").GetString());
  Assert.Equal(1,Risk(await Get(endpoint)).GetProperty("lowProducts").GetInt32());
  var inventory=await Get(endpoint+"?rackId="+b.rack);
  var units=inventory.GetProperty("rackTotals").EnumerateArray().Where(x=>x.GetProperty("rackId").GetGuid()==b.rack).ToArray();
  Assert.Equal(10,units.Single(x=>x.GetProperty("unit").GetString()=="EA").GetProperty("quantity").GetDecimal());Assert.Equal(5.5m,units.Single(x=>x.GetProperty("unit").GetString()=="kg").GetProperty("quantity").GetDecimal());
  var stockProducts=Risk(inventory).GetProperty("detail").GetProperty("stockProducts").EnumerateArray().ToArray();Assert.Contains(stockProducts,x=>x.GetProperty("productId").GetGuid()==Id(kg)&&x.GetProperty("status").GetString()=="safe");Assert.Contains(stockProducts,x=>x.GetProperty("productId").GetGuid()==Id(p)&&x.GetProperty("status").GetString()=="danger");
  for(var i=0;i<21;i++)await Stock(kg,wid,b.location,1,"PAGE-"+i);
  var pageOne=(await Get(endpoint+"?rackId="+b.rack)).GetProperty("detail").GetProperty("stock");var pageTwo=(await Get(endpoint+"?rackId="+b.rack+"&page=2")).GetProperty("detail").GetProperty("stock");
  Assert.Equal(23,pageOne.GetProperty("total").GetInt32());Assert.Equal(20,pageOne.GetProperty("items").GetArrayLength());Assert.Equal(3,pageTwo.GetProperty("items").GetArrayLength());
  var all=pageOne.GetProperty("items").EnumerateArray().Concat(pageTwo.GetProperty("items").EnumerateArray()).ToArray();Assert.Equal(26.5m,all.Where(x=>x.GetProperty("unit").GetString()=="kg").Sum(x=>x.GetProperty("quantity").GetDecimal()));Assert.All(all,x=>Assert.Equal(b.rack,x.GetProperty("rackId").GetGuid()));
  // Same product and rack, different locations/LOTs: expiry must not leak into inventory-only risk.
  var mixedRack=await Post(root+"/warehouses/"+wid+"/racks",new{code="MIXED",name="MIXED",levels=1,bays=2});
  var mixedId=Id(mixedRack);var front=await Get(root+"/warehouses/"+wid+"/racks/"+mixedId+"/front");
  var mixedLocations=front.GetProperty("locations").EnumerateArray().Select(x=>Id(x.GetProperty("location"))).ToArray();
  var mixedProduct=await Product("MixedExpiry",0);
  await Stock(mixedProduct,wid,mixedLocations[0],10,"DUE-TODAY",today);
  await Stock(mixedProduct,wid,mixedLocations[1],90,"FUTURE",today.AddYears(2));
  var mixed=await Get(endpoint+"?rackId="+mixedId);
  var mixedRisk=Risk(mixed).GetProperty("detail").GetProperty("stockProducts")[0];
  Assert.Equal("warning",mixedRisk.GetProperty("status").GetString());
  Assert.Equal("safe",mixedRisk.GetProperty("inventoryStatus").GetString());
  Assert.Empty(mixedRisk.GetProperty("inventoryReasons").EnumerateArray());
  Assert.Contains(mixedRisk.GetProperty("reasons").EnumerateArray(),x=>x.GetString()=="오늘 유통기한 만료");
  var mixedRows=mixed.GetProperty("detail").GetProperty("stock").GetProperty("items").EnumerateArray().ToArray();
  var future=mixedRows.Single(x=>x.GetProperty("lotNumber").GetString()=="FUTURE");
  Assert.Equal(today.AddYears(2).ToString("yyyy-MM-dd"),future.GetProperty("expiryDate").GetString());
  Assert.False(future.GetProperty("hasExpiring").GetBoolean());Assert.False(future.GetProperty("hasExpired").GetBoolean());
  Assert.True(mixedRows.Single(x=>x.GetProperty("lotNumber").GetString()=="DUE-TODAY").GetProperty("hasExpiring").GetBoolean());
  var before=(await Get(root+"/warehouses/"+wid+"/workspace")).ToString();await Get(endpoint);await Get(endpoint+"?rackId="+a.rack);Assert.Equal(before,(await Get(root+"/warehouses/"+wid+"/workspace")).ToString());
 }
}
