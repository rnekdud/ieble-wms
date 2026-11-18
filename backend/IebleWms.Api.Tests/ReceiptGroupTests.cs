using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ReceiptTests
{
 [Fact] public async Task GroupedTrackingPreservesOriginalIdsAndLotsThroughSplitPlacementAndIdempotentConfirmation()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=3,LotNumber="OLD-A"},new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=7,LotNumber="OLD-B"});
  var url=t.Root+"/"+Id(Doc(d));var ids=d.GetProperty("lines").EnumerateArray().Select(Id).ToArray();
  d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=ids[0],groupByProduct=true,quantity=10,reason="상품 합계 입력"},HttpStatusCode.OK));
  Assert.Equal(new[]{3m,7m},d.GetProperty("lines").EnumerateArray().Select(l=>l.GetProperty("inspectedQuantity").GetDecimal()));
  var secondLocation=Guid.NewGuid();
  using(var scope=f.Services.CreateScope()){var ctx=scope.ServiceProvider.GetRequiredService<WmsDbContext>();ctx.StorageLocations.Add(new(){Id=secondLocation,TenantId=t.Tenant,WarehouseId=s.Warehouse,Code="LOT-B-LOCATION",Name="LOT-B 위치"});await ctx.SaveChangesAsync();}
  var a=Guid.NewGuid();var b=Guid.NewGuid();
  d=await Post(c,url+"/tracking",new ReceiptTrackingRequest{Version=Version(Doc(d)),ProductId=s.Serial,Lines=[new(){LineId=ids[0],Allocations=[new(){Id=a,LotNumber="LOT-A",ExpiryDate=new(2027,5,10),Quantity=3,Serials=["S1"]}]},new(){LineId=ids[1],Allocations=[new(){Id=a,LotNumber="LOT-A",ExpiryDate=new(2027,5,10),Quantity=3,Serials=["S2"]},new(){Id=b,LotNumber="LOT-B",ExpiryDate=new(2027,6,15),Quantity=4,Serials=["S3"]}]}]},HttpStatusCode.OK);
  d=await c.GetFromJsonAsync<JsonElement>(url);
  Assert.Equal(ids,d.GetProperty("lines").EnumerateArray().Select(Id));
  Assert.Equal(2,d.GetProperty("lines")[1].GetProperty("trackingAllocations").GetArrayLength());
  d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=d.GetProperty("lines").EnumerateArray().Select(l=>new{lineId=Id(l),quantity=l.GetProperty("inspectedQuantity").GetDecimal()}).ToArray()},HttpStatusCode.OK);
  using(var scope=f.Services.CreateScope())Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.ToListAsync());
  var bad=new ReceiptPlacementRequest{Version=Version(Doc(d)),Lines=[new(){LineId=ids[0],Placements=[new(){TrackingId=a,LocationId=s.Location,Quantity=3,Serials=["S1"]}]},new(){LineId=ids[1],Placements=[new(){TrackingId=a,LocationId=s.Location,Quantity=3,Serials=["S3"]},new(){TrackingId=b,LocationId=secondLocation,Quantity=4,Serials=["S2"]}]}]};
  await Post(c,url+"/placements",bad,HttpStatusCode.BadRequest);
  bad.Lines[1].Placements[0].Serials=["S2"];bad.Lines[1].Placements[1].Serials=["S3"];
  d=await Post(c,url+"/placements",bad,HttpStatusCode.OK);
  d=await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.ToListAsync();
  Assert.Equal(10,stock.Sum(x=>x.Quantity));Assert.Equal(6,stock.Where(x=>x.LotNumber=="LOT-A").Sum(x=>x.Quantity));Assert.Equal(4,stock.Where(x=>x.LotNumber=="LOT-B"&&x.LocationId==secondLocation).Sum(x=>x.Quantity));Assert.Equal(3,stock.Count(x=>x.SerialNumber!=null));Assert.All(stock,x=>Assert.Contains(x.ReceiptLineId!.Value,ids));Assert.Equal(stock.Count,await db.StockMovements.CountAsync());Assert.Equal(2,await db.InboundReceiptLines.CountAsync());
  Assert.Contains(await db.ReceiptChanges.ToListAsync(),x=>x.Action=="TrackingUpdated"&&x.BeforeJson.Contains("OLD-A"));
 }
 [Fact] public async Task GroupScanCrossesLegacyRowsReplaysUndoesAndRejectsOverflow()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);
  var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=1,LotNumber="A"},new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=1,LotNumber="B"});var url=t.Root+"/"+Id(Doc(d));var first=Id(Line(d));
  var request=new{requestId=Guid.NewGuid(),barcode="CANDY-A",groupByProduct=true};
  d=ScanDetail(await Post(c,url+"/scan-inspection",request,HttpStatusCode.OK));
  var repeat=await Post(c,url+"/scan-inspection",request,HttpStatusCode.OK);Assert.True(repeat.GetProperty("replayed").GetBoolean());
  var second=new{requestId=Guid.NewGuid(),barcode="CANDY-A",groupByProduct=true};d=ScanDetail(await Post(c,url+"/scan-inspection",second,HttpStatusCode.OK));Assert.Equal(1,d.GetProperty("lines")[1].GetProperty("inspectedQuantity").GetDecimal());
  Assert.Equal("over-limit",(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A",groupByProduct=true},HttpStatusCode.OK)).GetProperty("outcome").GetString());
  d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=first,groupByProduct=true,undoScanRequestId=second.requestId,reason="중복 스캔"},HttpStatusCode.OK));
  Assert.Equal(0,d.GetProperty("lines")[1].GetProperty("inspectedQuantity").GetDecimal());Assert.Equal("B",d.GetProperty("lines")[1].GetProperty("lotNumber").GetString());
 }
 [Fact] public async Task TrackingValidatesTotalsDuplicatesExpiryAndLocksAfterInspection()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=10});var url=t.Root+"/"+Id(Doc(d));var line=Id(Line(d));
  d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=line,quantity=10,reason="검수"},HttpStatusCode.OK));
  var r=new ReceiptTrackingRequest{Version=Version(Doc(d)),ProductId=s.Serial,Lines=[new(){LineId=line,Allocations=[new(){Id=Guid.NewGuid(),LotNumber="A",Quantity=11}]}]};
  await Post(c,url+"/tracking",r,HttpStatusCode.BadRequest);
  r.Lines[0].Allocations[0].Quantity=6;r.Lines[0].Allocations[0].Serials=["DUP","DUP"];await Post(c,url+"/tracking",r,HttpStatusCode.BadRequest);
  r.Lines[0].Allocations[0].Serials=["ONE"];r.Lines[0].Allocations=[..r.Lines[0].Allocations,new(){Id=Guid.NewGuid(),LotNumber="A",ExpiryDate=new(2027,1,1),Quantity=4}];await Post(c,url+"/tracking",r,HttpStatusCode.BadRequest);
  r.Lines[0].Allocations=r.Lines[0].Allocations.Take(1).ToArray();d=await Post(c,url+"/tracking",r,HttpStatusCode.OK); // four optional untracked EA
  await Login(c,t,"Reader");r.Version=Version(Doc(d));Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/tracking",r)).StatusCode);await Login(c,t);
  d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=line,quantity=10}}},HttpStatusCode.OK);
  r.Version=Version(Doc(d));await Post(c,url+"/tracking",r,HttpStatusCode.Conflict);
  d=await Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=line,placements=new[]{new ReceiptPlacement{TrackingId=r.Lines[0].Allocations[0].Id,LocationId=s.Location,Quantity=6,Serials=["ONE"]},new ReceiptPlacement{LocationId=s.Location,Quantity=4}}}}},HttpStatusCode.OK);
  d=await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  var next=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=1});var nextUrl=t.Root+"/"+Id(Doc(next));var nextLine=Id(Line(next));next=ScanDetail(await Post(c,nextUrl+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(next)),lineId=nextLine,quantity=1,reason="다음 입고"},HttpStatusCode.OK));
  await Post(c,nextUrl+"/tracking",new ReceiptTrackingRequest{Version=Version(Doc(next)),ProductId=s.Serial,Lines=[new(){LineId=nextLine,Allocations=[new(){Id=Guid.NewGuid(),Quantity=1,Serials=["ONE"]}]}]},HttpStatusCode.Conflict);
 }
 [Fact] public async Task GroupPackagingScanSpansRowsAndUndoRestoresExactCounts()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var product=await db.Products.SingleAsync(x=>x.Id==s.Serial);product.InnerPackQuantity=10;product.OuterPackQuantity=5;db.StorageBarcodes.Add(new(){TenantId=t.Tenant,ProductId=s.Serial,Value="GROUP-OUTER",PackageCode="OUTER"});await db.SaveChangesAsync();}
  var d=await ScanDoc(c,t,s,new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=30,LotNumber="A"},new ReceiptLineRequest{ProductId=s.Serial,ExpectedQuantity=70,LotNumber="B"});var url=t.Root+"/"+Id(Doc(d));var first=Id(Line(d));
  var scan=new{requestId=Guid.NewGuid(),barcode="GROUP-OUTER",groupByProduct=true};d=ScanDetail(await Post(c,url+"/scan-inspection",scan,HttpStatusCode.OK));
  Assert.Equal(new[]{30m,20m},d.GetProperty("lines").EnumerateArray().Select(l=>l.GetProperty("inspectedQuantity").GetDecimal()));
  d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=first,groupByProduct=true,undoScanRequestId=scan.requestId,reason="포장 스캔 되돌리기"},HttpStatusCode.OK));
  Assert.All(d.GetProperty("lines").EnumerateArray(),l=>Assert.Equal(JsonValueKind.Null,l.GetProperty("inspectedQuantity").ValueKind));Assert.Equal(new[]{"A","B"},d.GetProperty("lines").EnumerateArray().Select(l=>l.GetProperty("lotNumber").GetString()));
 }

}
