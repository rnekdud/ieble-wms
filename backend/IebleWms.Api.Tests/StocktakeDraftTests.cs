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
 [Fact] public async Task RepeatStocktakeDraftPreservesIdentityAndInventory(){using var f=new AuthFactory();using var c=f.Client();await DraftScenario(f,c);}
 [ScanPostgresFact] public async Task PostgresRepeatStocktakeDraft(){using var f=new ScanPostgresFactory();using var c=f.Client();await DraftScenario(f,c);}
 static async Task DraftScenario(WebApplicationFactory<Program> f,HttpClient c)
 {
  var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);await Receive(c,t,s);await Receive(c,t,s,true);
  var root=$"/api/tenants/{t.Tenant}/stocktakes";
  async Task<List<StockBalance>> Stocks(){using var scope=f.Services.CreateScope();return await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.AsNoTracking().OrderBy(x=>x.Id).ToListAsync();}
  async Task<string> Snapshot(){using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();return JsonSerializer.Serialize(new{stocks=await Stocks(),movements=await db.StockMovements.OrderBy(x=>x.Id).ToListAsync()});}
  var stocks=await Stocks();var bulk=stocks.Single(x=>x.ProductId==s.Bulk);var serials=stocks.Where(x=>x.ProductId==s.Serial).ToArray();
  StocktakeSelectionInput Input(StockBalance stock,decimal? q)=>new(){StockId=stock.Id,StockVersion=stock.Version,Quantity=q,ObservedSerial=q==1?stock.SerialNumber:null,Reason="실물 확인"};
  var request=new StocktakeRequest{RequestId=Guid.NewGuid(),Name="반복 저장",WarehouseId=s.Warehouse,Scope="Selected",BasisAt=DateTimeOffset.UtcNow,ContactName="Master",Selection=[Input(bulk,8)]};
  var before=await Snapshot();var d=await Post(c,root,request);var id=Id(Document(d));var number=Document(d).GetProperty("number").GetString();var path=root+"/"+id;
  Assert.Equal(id,Id(Document(await Post(c,root,request))));Assert.Equal(before,await Snapshot());
  StocktakeDraftRequest Draft(JsonElement detail,params StocktakeDraftItem[] items)=>new(){Version=Version(Document(detail)),BasisAt=request.BasisAt,ContactName="실사 담당",Notes="반복 저장 메모",Items=items};
  var bulkTarget=Id(d.GetProperty("selectedItems")[0]);
  var edit=Draft(d,new(){TargetId=bulkTarget,Selection=Input(bulk,7)},new(){Selection=Input(serials[0],0)});
  d=await Post(c,path+"/draft",edit,HttpStatusCode.OK);Assert.Equal(before,await Snapshot());Assert.Equal(number,Document(d).GetProperty("number").GetString());Assert.Equal("Counting",Document(d).GetProperty("status").GetString());Assert.Equal(2,d.GetProperty("selectedItems").GetArrayLength());
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/draft",edit)).StatusCode);
  var rows=d.GetProperty("selectedItems").EnumerateArray().ToArray();var serialTarget=Id(rows.Single(x=>x.GetProperty("stockId").GetGuid()==serials[0].Id));
  // A duplicate addition must roll back metadata changes, removals and quantity edits together.
  var invalid=Draft(d,new(){TargetId=bulkTarget,Selection=Input(bulk,6)},new(){Selection=Input(bulk,6)});
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/draft",invalid)).StatusCode);
  var latest=await c.GetFromJsonAsync<JsonElement>(path);Assert.Equal(Version(Document(d)),Version(Document(latest)));Assert.Equal(2,latest.GetProperty("selectedItems").GetArrayLength());
  d=await Post(c,path+"/draft",Draft(d,new(){TargetId=bulkTarget,Selection=Input(bulk,7)},new(){TargetId=serialTarget,Selection=Input(serials[0],0)},new(){Selection=Input(serials[1],1)}),HttpStatusCode.OK);
  Assert.Equal(before,await Snapshot());Assert.Equal(3,d.GetProperty("summary").GetProperty("total").GetInt32());
  d=await Step(c,t,d,"complete");Assert.Equal("Counted",Document(d).GetProperty("status").GetString());
  // Remove one existing row and persist a missing count distinctly from zero.
  d=await Post(c,path+"/draft",Draft(d,new(){TargetId=bulkTarget,Selection=Input(bulk,null)},new(){TargetId=serialTarget,Selection=Input(serials[0],0)}),HttpStatusCode.OK);
  Assert.Equal(1,d.GetProperty("summary").GetProperty("missing").GetInt32());Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/confirm-selected",new{version=Version(Document(d))})).StatusCode);
  d=await Post(c,path+"/draft",Draft(d,new(){TargetId=bulkTarget,Selection=Input(bulk,7)},new(){TargetId=serialTarget,Selection=Input(serials[0],0)},new(){Selection=Input(serials[1],1)}),HttpStatusCode.OK);
  Assert.Equal(before,await Snapshot());Assert.Equal(3,d.GetProperty("selectedItems").GetArrayLength());
  await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,path+"/draft",Draft(d))).StatusCode);
  await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(path)).StatusCode);await Login(c,t);
  d=await Step(c,t,d,"confirm-selected");var after=await Snapshot();await Step(c,t,d,"confirm-selected");Assert.Equal(after,await Snapshot());
  var balances=await Stocks();Assert.Equal(7,balances.Single(x=>x.Id==bulk.Id).Quantity);Assert.Equal(0,balances.Single(x=>x.Id==serials[0].Id).Quantity);Assert.Equal(1,balances.Single(x=>x.Id==serials[1].Id).Quantity);
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,path+"/draft",Draft(d))).StatusCode);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Equal(1,await db.Stocktakes.CountAsync(x=>x.TenantId==t.Tenant));Assert.Equal(2,await db.StockMovements.CountAsync(x=>x.StocktakeId==id));Assert.Equal(3,await db.StocktakeTargets.CountAsync(x=>x.StocktakeId==id));Assert.True(await db.StocktakeChanges.AnyAsync(x=>x.StocktakeId==id&&x.Action=="DraftSaved"));}
 }
}
