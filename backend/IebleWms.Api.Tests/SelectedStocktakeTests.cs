using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class StocktakeTests
{
 [Fact] public async Task SelectedStocktakeWorkflow(){using var f=new AuthFactory();using var c=f.Client();await SelectedScenario(f,c,false);}
 [ScanPostgresFact] public async Task PostgresSelectedStocktake(){using var f=new ScanPostgresFactory();using var c=f.Client();await SelectedScenario(f,c,true);}
 static async Task SelectedScenario(WebApplicationFactory<Program> f,HttpClient c,bool postgres)
 {
  var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);await Receive(c,t,s,true);
  Guid first,second,match,unselected,serial,locationB,rackId;
  using(var scope=f.Services.CreateScope()){
   var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var a=await db.StockBalances.SingleAsync(x=>x.ProductId==s.Bulk);a.Quantity=50;first=a.Id;
   var rack=new WarehouseRack{TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="R-02",Name="실사 랙",Levels=1,Bays=1};db.Add(rack);rackId=rack.Id;
   var loc=new StorageLocation{TenantId=t.Tenant,WarehouseId=s.Warehouse,RackId=rack.Id,Code="R-02-1-1",Name="실사 위치",Level=1,Bay=1};db.Add(loc);locationB=loc.Id;
   var b=new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=loc.Id,Unit="kg",Quantity=20,LotNumber="LOT-B",SourceKey="SELECT-B"};
   var m=new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=loc.Id,Unit="kg",Quantity=10,LotNumber="MATCH",SourceKey="SELECT-MATCH"};
   var u=new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=loc.Id,Unit="kg",Quantity=12,LotNumber="UNSELECTED",SourceKey="SELECT-UNSELECTED"};db.AddRange(b,m,u);second=b.Id;match=m.Id;unselected=u.Id;
   for(var n=0;n<22;n++)db.Add(new StockBalance{TenantId=t.Tenant,ProductId=s.Bulk,WarehouseId=s.Warehouse,LocationId=loc.Id,Unit="kg",Quantity=1,LotNumber=$"PAGE-{n:00}",SourceKey=$"PAGE-{n:00}"});
   db.Add(new StorageBarcode{TenantId=t.Tenant,ProductId=s.Bulk,Value="STOCKTAKE-ALT"});await db.SaveChangesAsync();serial=await db.StockBalances.Where(x=>x.ProductId==s.Serial&&x.SerialNumber=="SN-1").Select(x=>x.Id).SingleAsync();
  }
  var root=CountsRoot(t);
  async Task<JsonElement> Get(string path){var r=await c.GetAsync(path);Assert.True(r.IsSuccessStatusCode,await r.Content.ReadAsStringAsync());return await r.Content.ReadFromJsonAsync<JsonElement>();}
  async Task<StockBalance> Balance(Guid id){using var scope=f.Services.CreateScope();return await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.AsNoTracking().SingleAsync(x=>x.Id==id);}
  async Task<string> Snapshot(){using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();return JsonSerializer.Serialize(new{stocks=await db.StockBalances.OrderBy(x=>x.Id).ToListAsync(),movements=await db.StockMovements.OrderBy(x=>x.Id).ToListAsync(),allocations=await db.ShipmentAllocations.OrderBy(x=>x.Id).ToListAsync()});}
  async Task<StocktakeSelectionInput> InputFor(Guid id,decimal? qty){var b=await Balance(id);return new(){StockId=id,StockVersion=b.Version,Quantity=qty,Reason=qty==b.Quantity?null:"실물 차이 확인",ObservedSerial=b.SerialNumber!=null&&qty==1?b.SerialNumber:null};}
  StocktakeRequest RequestFor(params StocktakeSelectionInput[] items)=>new(){RequestId=Guid.NewGuid(),Name="선택 실사 QA",WarehouseId=s.Warehouse,Scope="Selected",BasisAt=DateTimeOffset.UtcNow,ContactName="QA",Selection=items};
  var candidates=await Get(root+$"/candidates?warehouseId={s.Warehouse}&search=STOCKTAKE-ALT");Assert.Equal(26,candidates.GetProperty("total").GetInt32());Assert.Equal(20,candidates.GetProperty("items").GetArrayLength());Assert.Equal(6,(await Get(root+$"/candidates?warehouseId={s.Warehouse}&search=STOCKTAKE-ALT&page=2")).GetProperty("items").GetArrayLength());
  Assert.Equal(25,(await Get(root+$"/candidates?warehouseId={s.Warehouse}&rackId={rackId}")).GetProperty("total").GetInt32());
  var productStocks=await Get(root+$"/candidates?warehouseId={s.Warehouse}&productId={s.Bulk}");Assert.Equal(26,productStocks.GetProperty("total").GetInt32());Assert.All(productStocks.GetProperty("items").EnumerateArray(),x=>Assert.Equal(s.Bulk,x.GetProperty("productId").GetGuid()));
  Assert.Equal(0,(await Get(root+$"/candidates?warehouseId={s.Warehouse}&productId={Guid.NewGuid()}")).GetProperty("total").GetInt32());
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();(await db.WarehouseRacks.SingleAsync(r=>r.Id==rackId)).Name="검색 전용 랙";await db.SaveChangesAsync();}
  Assert.Equal(25,(await Get(root+$"/candidates?warehouseId={s.Warehouse}&productId={s.Bulk}&search="+Uri.EscapeDataString("검색 전용 랙"))).GetProperty("total").GetInt32());

  var before=await Snapshot();var request=RequestFor(await InputFor(first,45),await InputFor(second,25),await InputFor(match,10),await InputFor(serial,0),new(){ProductId=s.Bulk,LocationId=locationB,LotNumber="FOUND",Quantity=4,Reason="전산 누락"},new(){ProductId=s.Serial,LocationId=locationB,SerialNumber="FOUND-SN",Quantity=1,ObservedSerial="FOUND-SN",Reason="실물 발견"});
  var d=await Post(c,root,request);Assert.Equal(before,await Snapshot());Assert.Equal(6,d.GetProperty("summary").GetProperty("total").GetInt32());Assert.Equal(Id(Document(d)),Id(Document(await Post(c,root,request))));
  var path=root+"/"+Id(Document(d));var originalRows=await Items(c,t,d);var unchanged=(await Balance(match)).Version;var untouched=(await Balance(unselected)).Version;
  // Unselected stock changes neither extend the target list nor invalidate the selected baseline.
  var b0=await Balance(unselected);await Post(c,Inventory(t)+"/adjust",new InventoryRequest{RequestId=Guid.NewGuid(),StockId=unselected,Version=b0.Version,Quantity=1,Increase=true,OccurredAt=DateTimeOffset.UtcNow,Reason="unselected change"});
  Assert.Equal(0,(await Get(path)).GetProperty("conflicts").GetArrayLength());Assert.False((await Get(path)).GetProperty("incoming").GetBoolean());
  var shipment=await Post(c,Root(t),OutRequest(s,20));Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/confirm-selected",new{version=Version(Document(d))})).StatusCode);
  d=await Step(c,t,d,"reconfirm");var rebase=(await Items(c,t,d)).Single(x=>x.GetProperty("stockId").ValueKind!=JsonValueKind.Null&&x.GetProperty("stockId").GetGuid()==first);Assert.Equal(50,rebase.GetProperty("originalQuantity").GetDecimal());Assert.Equal(JsonValueKind.Null,rebase.GetProperty("countedQuantity").ValueKind);Assert.Equal(1,d.GetProperty("summary").GetProperty("missing").GetInt32());
  d=await Post(c,path+"/counts",new{version=Version(Document(d)),items=new[]{new{targetId=Id(rebase),quantity=15,reason="부족"}}},HttpStatusCode.OK);before=await Snapshot();Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/confirm-selected",new{version=Version(Document(d))})).StatusCode);Assert.Equal(before,await Snapshot());
  d=await Post(c,path+"/counts",new{version=Version(Document(d)),items=new[]{new{targetId=Id(rebase),quantity=45,reason=(string?)null}}},HttpStatusCode.OK);Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,path+"/confirm-selected",new{version=Version(Document(d))})).StatusCode);
  d=await Post(c,path+"/counts",new{version=Version(Document(d)),items=new[]{new{targetId=Id(rebase),quantity=45,reason="분실 확인"}}},HttpStatusCode.OK);
  // Failure of audit FK rolls back every changed stock and ledger entry.
  before=await Snapshot();using(var scope=f.Services.CreateScope()){var svc=scope.ServiceProvider.GetRequiredService<IebleWms.Api.Inventory.StocktakeService>();await Assert.ThrowsAsync<IebleWms.Api.Organization.OrganizationException>(()=>svc.Action(t.Tenant,Guid.NewGuid(),Id(Document(d)),"confirm-selected",new(){Version=Version(Document(d))},default));}Assert.Equal(before,await Snapshot());
  d=await Step(c,t,d,"confirm-selected");var after=await Snapshot();await Step(c,t,d,"confirm-selected");Assert.Equal(after,await Snapshot());Assert.Equal(45,(await Balance(first)).Quantity);Assert.Equal(20,(await Balance(first)).ReservedQuantity);Assert.Equal(25,(await Balance(second)).Quantity);Assert.Equal(0,(await Balance(serial)).Quantity);Assert.Equal(unchanged,(await Balance(match)).Version);Assert.Equal(13,(await Balance(unselected)).Quantity);Assert.NotEqual(untouched,(await Balance(unselected)).Version);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(5,await db.StockMovements.CountAsync(x=>x.StocktakeId==Id(Document(d))));Assert.Equal(5,await db.StocktakeChanges.CountAsync(x=>x.StocktakeId==Id(Document(d))&&x.Action=="Applied"));Assert.Equal(1,(await db.StockBalances.SingleAsync(x=>x.SerialNumber=="FOUND-SN")).Quantity);}
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/selection",new{version=Version(Document(d)),remove=new[]{Id(originalRows[0])}})).StatusCode);
  // Selection edits preserve history; a removed target may be selected again without a duplicate row.
  var edit=await Post(c,root,RequestFor(await InputFor(second,null)));var editPath=root+"/"+Id(Document(edit));var target=Assert.Single(await Items(c,t,edit));
  edit=await Post(c,editPath+"/selection",new{version=Version(Document(edit)),remove=new[]{Id(target)}},HttpStatusCode.OK);Assert.Equal(0,edit.GetProperty("summary").GetProperty("total").GetInt32());
  edit=await Post(c,editPath+"/selection",new{version=Version(Document(edit)),add=new[]{await InputFor(second,24)}},HttpStatusCode.OK);Assert.Equal(Id(target),Id(Assert.Single(await Items(c,t,edit))));
  var stale=await InputFor(first,44);stale.StockVersion=Guid.NewGuid();Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root,RequestFor(stale))).StatusCode);
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,root,RequestFor(new StocktakeSelectionInput{ProductId=s.Serial,LocationId=locationB,SerialNumber="SN-2",Quantity=1,ObservedSerial="SN-2"}))).StatusCode);
  Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,root,RequestFor(new StocktakeSelectionInput{ProductId=s.Bulk,LocationId=s.OtherLocation,Quantity=1}))).StatusCode);
  var full=await CreateCount(c,t,s);Assert.True(full.GetProperty("summary").GetProperty("total").GetInt32()>6);Assert.Equal("Prepared",Document(full).GetProperty("status").GetString());
  await Login(c,t,"Reader");foreach(var action in new[]{"selection","confirm-selected"})Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,editPath+"/"+action,new{version=Version(Document(edit)),remove=new[]{Id(target)}})).StatusCode);await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(root+"/candidates?warehouseId="+s.Warehouse)).StatusCode);await Login(c,t);
  if(postgres){
   // Reservation and selected-count confirmation serialize on the existing inventory lock.
   Guid raceProduct,raceStock;
   using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var p=new Product{TenantId=t.Tenant,Code="RACE",NormalizedCode="RACE",Name="동시성",Unit="EA",CreationRequestId=Guid.NewGuid()};var stock=new StockBalance{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,ProductId=p.Id,Unit="EA",Quantity=10,SourceKey="RACE"};db.AddRange(p,stock);await db.SaveChangesAsync();raceProduct=p.Id;raceStock=stock.Id;}
   var race=await Post(c,root,RequestFor(await InputFor(raceStock,4)));var outbound=OutRequest(s,7);outbound.Lines=[new(){ProductId=raceProduct,RequestedQuantity=7}];
   var responses=await Task.WhenAll(AuthTests.Post(c,root+"/"+Id(Document(race))+"/confirm-selected",new{version=Version(Document(race))}),AuthTests.Post(c,Root(t),outbound));Assert.Single(responses,r=>r.IsSuccessStatusCode);Assert.Single(responses,r=>r.StatusCode==HttpStatusCode.Conflict);var raceBalance=await Balance(raceStock);Assert.True(raceBalance.Quantity>=raceBalance.ReservedQuantity);
  }
  var output=Environment.GetEnvironmentVariable("WMS_STOCKTAKE_QA_FIXTURE");if(postgres&&!string.IsNullOrEmpty(output))await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{tenant=t.Tenant,password=t.Password,warehouse=s.Warehouse,location=s.Location,locationB,rack=rackId,bulk=s.Bulk,serialProduct=s.Serial,first,second,match,unselected,document=Id(Document(d)),editable=Id(Document(edit)),shipment=Id(Shipment(shipment))}));
 }
}
