using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public partial class UnifiedBarcodeTests
{
 [Fact] public async Task AllOwnersShareNamespaceWithStableIdsAndAudits(){using var f=new AuthFactory();using var c=f.Client();var root=await Login(c);await UnifiedBarcodeScenario.Run(c,root);}
 [Fact] public async Task DatabaseConstraintRejectsCrossKindDuplicateWithoutApplicationCheck()
 {
  using var f=new AuthFactory();using var c=f.Client();var root=await Login(c);var t=Guid.Parse(root.Split('/').Last());
  using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=new Product{TenantId=t,Code="P",NormalizedCode="P",Name="Product",CreationRequestId=Guid.NewGuid()};var w=new Warehouse{TenantId=t,Code="W",Name="Warehouse"};var l=new StorageLocation{TenantId=t,WarehouseId=w.Id,Code="L",Name="Location"};db.AddRange(p,w,l);await db.SaveChangesAsync();db.AddRange(new StorageBarcode{TenantId=t,ProductId=p.Id,Value="COLLISION"},new StorageBarcode{TenantId=t,WarehouseId=w.Id,LocationId=l.Id,Value="COLLISION"});await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());db.ChangeTracker.Clear();Assert.Equal(0,await db.StorageBarcodes.CountAsync());
 }
 [Fact] public async Task LookupDoesNotExposeAnotherTenant()
 {
  using var f=new AuthFactory();using var a=f.Client();using var b=f.Client();var root=await Login(a);var other=await Login(b);
  var w=await AuthTests.Post(a,root+"/warehouses",new{name="A"});var id=(await w.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();await AuthTests.Post(a,root+$"/warehouses/{id}/racks",new{code="R",name="R",levels=1,bays=1,barcode=new{mode="manual",value="A-ONLY"}});
  Assert.Equal(HttpStatusCode.NotFound,(await b.GetAsync(other+"/barcodes/lookup?value=A-ONLY")).StatusCode);Assert.Equal(HttpStatusCode.Forbidden,(await b.GetAsync(root+"/barcodes/lookup?value=A-ONLY")).StatusCode);
 }
 [Fact] public async Task ReaderCannotGenerateOrModifyAndStockNeedsSeparatePermission()
 {
  using var f=new AuthFactory();using var c=f.Client();var root=await Login(c);Guid locationId,warehouseId,userId;
  using(var scope=f.Services.CreateScope()){
   var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var t=Guid.Parse(root.Split('/').Last());var membership=await db.TenantMemberships.SingleAsync();userId=membership.UserId;membership.Role=TenantRole.Employee;
   var grants=IebleWms.Api.Permissions.PermissionCatalog.Defaults();grants["Employee"]["warehouses"]=["menu","read"];grants["Employee"]["products"]=[];grants["Employee"]["stock-overview"]=[];
   db.TenantPermissionSettings.Add(new(){TenantId=t,RolesJson=JsonSerializer.Serialize(grants),UpdatedByUserId=userId});var w=new Warehouse{TenantId=t,Code="W",Name="W"};var l=new StorageLocation{TenantId=t,WarehouseId=w.Id,Code="L",Name="L"};db.AddRange(w,l,new StorageBarcode{TenantId=t,WarehouseId=w.Id,LocationId=l.Id,Value="READ-ONLY"});await db.SaveChangesAsync();locationId=l.Id;warehouseId=w.Id;
  }
  var result=await c.GetFromJsonAsync<JsonElement>(root+"/barcodes/lookup?value=READ-ONLY");Assert.False(result.GetProperty("inventoryAvailable").GetBoolean());
  Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+$"/barcodes/locations/{locationId}/stock")).StatusCode);
  foreach(var kind in new[]{"product","rack","location"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root+"/barcodes/candidates?kind="+kind,new{})).StatusCode);
  Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,root+$"/warehouses/{warehouseId}/locations/{locationId}",new{code="L",name="L",barcode=new{mode="manual",value="forged"}})).StatusCode);
 }
 static async Task<string> Login(HttpClient c){var email=Guid.NewGuid().ToString("N")+"@qa.test";var password="Qa1!"+Guid.NewGuid().ToString("N");Assert.Equal(HttpStatusCode.Created,(await AuthTests.Post(c,"/api/auth/register",new{companyName="Barcode QA",businessRegistrationNumber=System.Security.Cryptography.RandomNumberGenerator.GetInt32(1000000000,2000000000).ToString(),contactName="QA",contactPhone="010-1234-5678",email,password})).StatusCode);await AuthTests.Post(c,"/api/auth/login",new{email,password});return "/api/tenants/"+(await c.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("selectedTenantId").GetGuid();}
}
public static class UnifiedBarcodeScenario
{
 public static async Task Run(HttpClient c,string root)
 {
  async Task<JsonElement> Post(string url,object body){var r=await AuthTests.Post(c,url,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<JsonElement> Get(string url){var r=await c.GetAsync(url);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  static Guid Id(JsonElement x)=>x.GetProperty("id").GetGuid();static Guid Version(JsonElement x)=>x.GetProperty("version").GetGuid();
  var suffix=Guid.NewGuid().ToString("N")[..8];var warehouse=await Post(root+"/warehouses",new{name="Barcode QA"});var wr=root+"/warehouses/"+Id(warehouse);
  var values=new List<string>();foreach(var kind in new[]{"product","rack","location"}){var generated=await Post(root+"/barcodes/candidates?kind="+kind,new{});var value=generated.GetProperty("value").GetString()!;Assert.Matches("^880[0-9]{17}$",value);values.Add(value);Assert.Equal(HttpStatusCode.NotFound,(await c.GetAsync(root+"/barcodes/lookup?value="+value)).StatusCode);}
  Assert.Equal(3,values.Distinct().Count());
  var p=await Post(root+"/products",new{requestId=Guid.NewGuid(),code="B-"+suffix,name="Barcode product",unit="EA",barcode=new{mode="manual",value="LEGACY-"+suffix}});
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,wr+"/racks",new{code="DUP",name="dup",levels=1,bays=1,barcode=new{mode="manual",value=p.GetProperty("barcode").GetString()}})).StatusCode);
  var candidateRack=await Post(root+"/barcodes/candidates?kind=rack",new{});var rack=await Post(wr+"/racks",new{code="R",name="R",levels=3,bays=4,barcode=new{mode="auto",value=candidateRack.GetProperty("value").GetString(),proof=candidateRack.GetProperty("proof").GetString()}});
  var rr=wr+"/racks/"+Id(rack);var front=await Get(rr+"/front");var loc=front.GetProperty("locations")[0].GetProperty("location");var originalIds=front.GetProperty("locations").EnumerateArray().Select(x=>Id(x.GetProperty("location"))).ToArray();
  var candidate=await Post(root+"/barcodes/candidates?kind=location",new{});var label=candidate.GetProperty("value").GetString();
  var location=await Post(wr+"/locations/"+Id(loc),new{version=Version(loc),code=loc.GetProperty("code").GetString(),name=loc.GetProperty("name").GetString(),barcode=new{mode="auto",value=label,proof=candidate.GetProperty("proof").GetString()}});Assert.Equal(Id(loc),Id(location));Assert.Equal(label,location.GetProperty("barcode").GetString());
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root+"/products",new{requestId=Guid.NewGuid(),code="DUP-"+suffix,name="Dup",unit="EA",barcode=new{mode="manual",value=label}})).StatusCode);
  foreach(var pair in new[]{("product",p.GetProperty("barcode").GetString()),("rack",rack.GetProperty("barcode").GetString()),("location",label)})Assert.Equal(pair.Item1,(await Get(root+"/barcodes/lookup?value="+pair.Item2)).GetProperty("kind").GetString());
  Assert.Equal(0,(await Get(root+"/barcodes/locations/"+Id(location)+"/stock")).GetProperty("total").GetInt32());Assert.NotEmpty((await Get(root+"/barcodes/location/"+Id(location)+"/history")).EnumerateArray());
  await Post(rr,new{version=Version(rack),code="R",name="R",levels=4,bays=4,barcode=new{mode="keep"}});front=await Get(rr+"/front");Assert.Equal(16,front.GetProperty("locations").GetArrayLength());foreach(var id in originalIds)Assert.Contains(front.GetProperty("locations").EnumerateArray(),x=>Id(x.GetProperty("location"))==id);Assert.Equal(label,front.GetProperty("locations")[0].GetProperty("location").GetProperty("barcode").GetString());
  foreach(var invalid in new[]{"   ","\tBAD","한글"})Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,wr+"/locations/"+Id(location),new{version=Version(location),code=location.GetProperty("code").GetString(),name="Location",barcode=new{mode="manual",value=invalid}})).StatusCode);
 }
}
