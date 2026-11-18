using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class WarehousePlanTests
{
 [Theory][InlineData("empty")][InlineData("rack")][InlineData("location")][InlineData("stocktake")]
 public async Task ZoneDeletionPreservesChildrenAndBusinessHistory(string kind) {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);Guid id,version;
  using(var scope=f.Services.CreateScope()) {var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var zone=new WarehouseZone{TenantId=t.Tenant,WarehouseId=t.Warehouse,Code="ZONE",Name="구역"};db.Add(zone);id=zone.Id;
   if(kind=="rack")(await db.WarehouseRacks.SingleAsync(x=>x.Id==t.Rack)).ZoneId=id;
   if(kind=="location")db.Add(new StorageLocation{TenantId=t.Tenant,WarehouseId=t.Warehouse,ZoneId=id,Code="FLOOR",Name="위치"});
   if(kind=="stocktake")db.Add(new Stocktake{TenantId=t.Tenant,WarehouseId=t.Warehouse,Number="ZONE-COUNT",Name="실사",Scope="Zone",ScopeId=id,BasisDate=new DateOnly(2026,11,11)});
   await db.SaveChangesAsync();version=zone.Version;
  }
  var shape=Object();var zoneObject=Object();zoneObject.Type="zone";zoneObject.ZoneId=id;
  var saved=await AuthTests.Post(c,Root(t)+"/plan",Request(zoneObject,shape));Assert.Equal(HttpStatusCode.OK,saved.StatusCode);
  var planVersion=(await saved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetGuid();
  var body=new{planVersion,racks=Array.Empty<object>(),zones=new[]{new{id,version}}};
  using var staff=f.Client();await Login(staff,t,"Employee");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(staff,Root(t)+"/racks/delete",body)).StatusCode);
  Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,$"/api/tenants/{t.Foreign}/warehouses/{t.Warehouse}/racks/delete",body)).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,$"/api/tenants/{t.Tenant}/warehouses/{t.OtherWarehouse}/racks/delete",body)).StatusCode);
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,Root(t)+"/racks/delete",new{planVersion,zones=new[]{new{id,version=Guid.NewGuid()}}})).StatusCode);
  var response=await AuthTests.Post(c,Root(t)+"/racks/delete",body);Assert.Equal(kind=="empty"?HttpStatusCode.OK:HttpStatusCode.Conflict,response.StatusCode);
  using var verify=f.Services.CreateScope();var final=verify.ServiceProvider.GetRequiredService<WmsDbContext>();
  Assert.Equal(kind!="empty",await final.WarehouseZones.AnyAsync(x=>x.Id==id));Assert.Single(await final.WarehouseRacks.ToListAsync());Assert.Equal(kind=="location"?13:12,await final.StorageLocations.CountAsync());
  var plan=await c.GetFromJsonAsync<JsonElement>(Root(t)+"/plan");Assert.Equal(kind=="empty"?1:2,plan.GetProperty("objects").GetArrayLength());Assert.Contains(plan.GetProperty("objects").EnumerateArray(),o=>o.GetProperty("id").GetGuid()==shape.Id);
  if(kind=="empty"){Assert.NotEqual(planVersion,plan.GetProperty("version").GetGuid());Assert.Single(await final.WarehouseChanges.Where(x=>x.Action=="ZoneDeleted").ToListAsync());Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,Root(t)+"/racks/delete",body)).StatusCode);}
  else Assert.Empty(await final.WarehouseChanges.Where(x=>x.Action=="ZoneDeleted").ToListAsync());
 }
}
