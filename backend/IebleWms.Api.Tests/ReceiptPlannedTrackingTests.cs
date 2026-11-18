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
 [Fact] public async Task PlannedMultipleLotsAreOptionalAndCarryIntoActualInspectionWithoutReplacingLineOrAudit()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var a=Guid.NewGuid();var b=Guid.NewGuid();
  var request=Request(s);request.Lines=[new(){ProductId=s.Serial,ExpectedQuantity=100,TrackingAllocations=[new(){Id=a,LotNumber="PLANNED-A",ExpiryDate=new(2027,5,10),Quantity=60,Serials=["PLAN-S1"]},new(){Id=b,LotNumber="PLANNED-B",ExpiryDate=new(2027,6,15),Quantity=40}]}];
  var d=await Post(c,t.Root,request);var id=Id(Doc(d));var lineId=Id(Line(d));var url=t.Root+"/"+id;
  Assert.Equal(JsonValueKind.Null,Line(d).GetProperty("inspectedQuantity").ValueKind);
  Assert.True(Line(d).GetProperty("lotManaged").GetBoolean());Assert.True(Line(d).GetProperty("expiryManaged").GetBoolean());Assert.True(Line(d).GetProperty("serialManaged").GetBoolean());
  request.Version=Version(Doc(d));request.Lines[0].LineId=lineId;request.Notes="예정 정보 수정";
  d=await Post(c,url,request,HttpStatusCode.OK);Assert.Equal(lineId,Id(Line(d)));
  d=await Post(c,url+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
  Assert.Equal("PLANNED-A",Line(d).GetProperty("trackingAllocations")[0].GetProperty("lotNumber").GetString());
  d=ScanDetail(await Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId,quantity=100,reason="실물 검수"},HttpStatusCode.OK));
  d=await Post(c,url+"/tracking",new ReceiptTrackingRequest{Version=Version(Doc(d)),ProductId=s.Serial,Lines=[new(){LineId=lineId,Allocations=[new(){Id=a,LotNumber="ACTUAL-A",ExpiryDate=new(2027,7,1),Quantity=60,Serials=["REAL-S1","REAL-S2"]},new(){Id=b,LotNumber="ACTUAL-B",ExpiryDate=new(2027,8,1),Quantity=40}]}]},HttpStatusCode.OK);
  Assert.Equal(100,Scanned(d));Assert.Equal(lineId,Id(Line(d)));
  d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId,quantity=100}}},HttpStatusCode.OK);
  using(var check=f.Services.CreateScope()){var db=check.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());Assert.Contains(await db.ReceiptChanges.ToListAsync(),x=>x.Action=="Created"&&x.AfterJson.Contains("PLANNED-A"));Assert.Contains(await db.ReceiptChanges.ToListAsync(),x=>x.Action=="TrackingUpdated"&&x.BeforeJson.Contains("PLAN-S1")&&x.AfterJson.Contains("REAL-S1"));}
  d=await Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId,placements=new[]{new ReceiptPlacement{TrackingId=a,LocationId=s.Location,Quantity=60,Serials=["REAL-S1","REAL-S2"]},new ReceiptPlacement{TrackingId=b,LocationId=s.Location,Quantity=40}}}}},HttpStatusCode.OK);
  d=await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  using var final=f.Services.CreateScope();var stock=await final.ServiceProvider.GetRequiredService<WmsDbContext>().StockBalances.ToListAsync();Assert.Equal(100,stock.Sum(x=>x.Quantity));Assert.All(stock,x=>Assert.Equal(lineId,x.ReceiptLineId));Assert.DoesNotContain(stock,x=>x.LotNumber!.StartsWith("PLANNED")||x.SerialNumber=="PLAN-S1");
 }
 [Fact] public async Task NoTrackingRemainsOptionalAndLegacyDuplicateIdsSurvivePlannedEdit()
 {
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await Login(c,t);
  var request=Request(s);request.Lines=[new(){ProductId=s.Serial,ExpectedQuantity=30},new(){ProductId=s.Serial,ExpectedQuantity=70}];var d=await Post(c,t.Root,request);var url=t.Root+"/"+Id(Doc(d));var ids=d.GetProperty("lines").EnumerateArray().Select(Id).ToArray();
  request.Version=Version(Doc(d));for(var i=0;i<2;i++){request.Lines[i].LineId=ids[i];request.Lines[i].TrackingAllocations=[];}
  d=await Post(c,url,request,HttpStatusCode.OK);Assert.Equal(ids,d.GetProperty("lines").EnumerateArray().Select(Id));
  d=await Post(c,url+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);
  d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=ids[0],quantity=30},new{lineId=ids[1],quantity=70}}},HttpStatusCode.OK);
  d=await Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=ids[0],placements=new[]{new{locationId=s.Location,quantity=30}}},new{lineId=ids[1],placements=new[]{new{locationId=s.Location,quantity=70}}}}},HttpStatusCode.OK);
  d=await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await db.StockBalances.ToListAsync();Assert.Equal(100,stock.Sum(x=>x.Quantity));Assert.All(stock,x=>{Assert.Null(x.LotNumber);Assert.Null(x.ExpiryDate);Assert.Null(x.SerialNumber);});
 }
}
