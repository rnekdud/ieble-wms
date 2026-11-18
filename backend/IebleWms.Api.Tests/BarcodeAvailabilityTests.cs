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
 [Fact] public async Task AvailabilityUsesEveryAliasAndOwnerAndKeepsFinalSaveAuthoritative()
 {
  using var f=new AuthFactory();using var c=f.Client();await BarcodeAvailabilityScenario.Run(c,await Login(c));
 }
 [Fact] public async Task AvailabilityNeverExposesOtherTenantOrAllowsForeignSelfExclusion()
 {
  using var f=new AuthFactory();using var a=f.Client();using var b=f.Client();var root=await Login(a);var other=await Login(b);
  var r=await AuthTests.Post(a,root+"/products",new{requestId=Guid.NewGuid(),name="Private",unit="EA",barcode=new{mode="manual",value="PRIVATE"}});r.EnsureSuccessStatusCode();var id=(await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
  Assert.True((await b.GetFromJsonAsync<JsonElement>(other+"/barcodes/check?value=PRIVATE")).GetProperty("available").GetBoolean());
  Assert.Equal(HttpStatusCode.Forbidden,(await b.GetAsync(root+"/barcodes/check?value=PRIVATE")).StatusCode);
  Assert.Equal(HttpStatusCode.NotFound,(await b.GetAsync(other+$"/barcodes/check?value=PRIVATE&productId={id}")).StatusCode);
 }
 [Fact] public async Task AvailabilityRedactsOwnersWithoutReadPermissionAndRejectsReaders()
 {
  using var f=new AuthFactory();using var c=f.Client();var root=await Login(c);var t=Guid.Parse(root.Split('/').Last());
  using(var scope=f.Services.CreateScope()){
   var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var member=await db.TenantMemberships.SingleAsync();member.Role=TenantRole.Employee;
   var grants=IebleWms.Api.Permissions.PermissionCatalog.Defaults();grants["Employee"]["products"]=["menu","create"];grants["Employee"]["warehouses"]=[];
   db.TenantPermissionSettings.Add(new(){TenantId=t,RolesJson=JsonSerializer.Serialize(grants),UpdatedByUserId=member.UserId});
   var p=new Product{TenantId=t,Code="SECRET-P",NormalizedCode="SECRET-P",Name="Private",CreationRequestId=Guid.NewGuid()};var w=new Warehouse{TenantId=t,Code="SECRET-W",Name="Private warehouse"};var r=new WarehouseRack{TenantId=t,WarehouseId=w.Id,Code="R",Name="Secret rack",Levels=1,Bays=1};var l=new StorageLocation{TenantId=t,WarehouseId=w.Id,Code="L",Name="Secret location"};
   db.AddRange(p,w,r,l);await db.SaveChangesAsync();db.AddRange(new StorageBarcode{TenantId=t,ProductId=p.Id,Value="P"},new StorageBarcode{TenantId=t,WarehouseId=w.Id,RackId=r.Id,Value="R"},new StorageBarcode{TenantId=t,WarehouseId=w.Id,LocationId=l.Id,Value="L"});await db.SaveChangesAsync();
  }
  Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/barcodes/check?value=P")).StatusCode);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var settings=await db.TenantPermissionSettings.SingleAsync();var grants=IebleWms.Api.Permissions.PermissionCatalog.Defaults();grants["Employee"]["products"]=["menu","read","create"];grants["Employee"]["warehouses"]=[];settings.RolesJson=JsonSerializer.Serialize(grants);await db.SaveChangesAsync();}
  Assert.Equal("product",(await c.GetFromJsonAsync<JsonElement>(root+"/barcodes/check?value=P")).GetProperty("conflict").GetProperty("kind").GetString());
  foreach(var value in new[]{"R","L"}){var result=await c.GetFromJsonAsync<JsonElement>(root+"/barcodes/check?value="+value);Assert.False(result.GetProperty("available").GetBoolean());Assert.Single(result.EnumerateObject());}
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var settings=await db.TenantPermissionSettings.SingleAsync();var grants=IebleWms.Api.Permissions.PermissionCatalog.Defaults();grants["Employee"]["products"]=["menu","read"];settings.RolesJson=JsonSerializer.Serialize(grants);await db.SaveChangesAsync();}
  Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/barcodes/check?value=P")).StatusCode);
 }
}
public static class BarcodeAvailabilityScenario
{
 public static async Task Run(HttpClient c,string root)
 {
  async Task<JsonElement> Post(string url,object body){var r=await AuthTests.Post(c,url,body);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<JsonElement> Check(string value,Guid? id=null)=>await c.GetFromJsonAsync<JsonElement>(root+"/barcodes/check?value="+Uri.EscapeDataString(value)+(id.HasValue?"&productId="+id:""));
  var tag=Guid.NewGuid().ToString("N")[..8];var a="AV-A-"+tag;var b="AV-B-"+tag;
  var p=await Post(root+"/products",new{requestId=Guid.NewGuid(),name="사탕",unit="EA",barcodes=new[]{new{change=new{mode="manual",value=a},isPrimary=true},new{change=new{mode="manual",value=b},isPrimary=false}}});var id=p.GetProperty("id").GetGuid();
  foreach(var value in new[]{a,b}){var check=await Check(value);Assert.False(check.GetProperty("available").GetBoolean());var conflict=check.GetProperty("conflict");Assert.Equal(id,conflict.GetProperty("id").GetGuid());Assert.Equal("사탕",conflict.GetProperty("name").GetString());Assert.False(conflict.TryGetProperty("costPrice",out _));Assert.True((await Check(value,id)).GetProperty("available").GetBoolean());}
  var w=await Post(root+"/warehouses",new{name="중복 검사 창고"});var wr=root+"/warehouses/"+w.GetProperty("id").GetGuid();
  var r=await Post(wr+"/racks",new{code="R-1",name="Rack",levels=1,bays=1,barcode=new{mode="manual",value="AV-R-"+tag}});
  var front=await c.GetFromJsonAsync<JsonElement>(wr+"/racks/"+r.GetProperty("id").GetGuid()+"/front");var l=front.GetProperty("locations")[0].GetProperty("location");
  await Post(wr+"/locations/"+l.GetProperty("id").GetGuid(),new{version=l.GetProperty("version").GetGuid(),code=l.GetProperty("code").GetString(),name="Location",barcode=new{mode="manual",value="AV-L-"+tag}});
  foreach(var pair in new[]{("AV-R-","rack"),("AV-L-","location")}){var result=await Check(pair.Item1+tag);Assert.False(result.GetProperty("available").GetBoolean());Assert.Equal(pair.Item2,result.GetProperty("conflict").GetProperty("kind").GetString());Assert.Equal("중복 검사 창고",result.GetProperty("conflict").GetProperty("warehouseName").GetString());}
  var available="AV-NEW-"+tag;Assert.True((await Check(available)).GetProperty("available").GetBoolean());
  await Post(root+"/products",new{requestId=Guid.NewGuid(),name="First save",unit="EA",barcode=new{mode="manual",value=available}});
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root+"/products",new{requestId=Guid.NewGuid(),name="Stale available result",unit="EA",barcode=new{mode="manual",value=available}})).StatusCode);
  foreach(var value in new[]{"   ","BAD\t","한글",new string('A',65)})Assert.Equal(HttpStatusCode.BadRequest,(await c.GetAsync(root+"/barcodes/check?value="+Uri.EscapeDataString(value))).StatusCode);
 }
}
