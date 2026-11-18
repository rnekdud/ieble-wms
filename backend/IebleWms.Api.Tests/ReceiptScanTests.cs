using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Receiving;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ReceiptTests
{
 static async Task ScanLabels(AuthFactory f,Fixture t,Structure s){using var scope=f.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();db.AddRange(new StorageBarcode{TenantId=t.Tenant,ProductId=s.Serial,Value="CANDY-A",IsPrimary=true},new StorageBarcode{TenantId=t.Tenant,ProductId=s.Serial,Value="CANDY-B"},new StorageBarcode{TenantId=t.Tenant,ProductId=s.Bulk,Value="WEIGHT"},new StorageBarcode{TenantId=t.Tenant,WarehouseId=s.Warehouse,LocationId=s.Location,Value="LOCATION"});await db.SaveChangesAsync();}
 static async Task<JsonElement> ScanDoc(HttpClient c,Fixture t,Structure s,params ReceiptLineRequest[] lines){var r=Request(s);r.Lines=lines;var d=await Post(c,t.Root,r);return await Post(c,t.Root+"/"+Id(Doc(d))+"/start-inspection",new{version=Version(Doc(d))},HttpStatusCode.OK);}
 static JsonElement ScanDetail(JsonElement response)=>response.GetProperty("detail");
 static decimal Scanned(JsonElement d)=>Line(d).GetProperty("inspectedQuantity").GetDecimal();
 [Fact] public async Task TwentyScansAliasReplayOverflowAndFinalStockAreCorrect(){
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);
  var d=await ScanDoc(c,t,s,new ReceiptLineRequest(){ProductId=s.Serial,ExpectedQuantity=20,LotNumber="CANDY-LOT"});var id=Id(Doc(d));var line=Id(Line(d));var url=t.Root+"/"+id;object? first=null;
  for(int i=0;i<20;i++){var body=new{requestId=Guid.NewGuid(),barcode=i%2==0?"CANDY-A":"CANDY-B"};first??=body;d=ScanDetail(await Post(c,url+"/scan-inspection",body,HttpStatusCode.OK));Assert.Equal(i+1,Scanned(d));Assert.Equal(line,Id(Line(d)));}
  var repeated=await Post(c,url+"/scan-inspection",first!,HttpStatusCode.OK);Assert.True(repeated.GetProperty("replayed").GetBoolean());Assert.Equal(20,Scanned(ScanDetail(repeated)));
  var over=await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-B"},HttpStatusCode.OK);Assert.Equal("over-limit",over.GetProperty("outcome").GetString());Assert.Equal(20,Scanned(ScanDetail(over)));
  Assert.Equal(20,Scanned(await c.GetFromJsonAsync<JsonElement>(url)));
  using(var scope=f.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Empty(await db.StockBalances.ToListAsync());Assert.Equal(20,await db.ReceiptChanges.CountAsync(x=>x.Action=="BarcodeScanned"));}
  d=await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=line,quantity=20,lotNumber="CANDY-LOT"}}},HttpStatusCode.OK);
  d=await Post(c,url+"/placements",new{version=Version(Doc(d)),lines=new[]{new{lineId=line,placements=new[]{new{locationId=s.Location,quantity=20}}}}},HttpStatusCode.OK);
  d=await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  await Post(c,url+"/confirm",new{version=Version(Doc(d))},HttpStatusCode.OK);
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
  using var verify=f.Services.CreateScope();var ctx=verify.ServiceProvider.GetRequiredService<WmsDbContext>();var stock=await ctx.StockBalances.SingleAsync();Assert.Equal(20,stock.Quantity);Assert.Equal("CANDY-LOT",stock.LotNumber);Assert.Equal(1,await ctx.StockMovements.CountAsync());
 }
 [Fact] public async Task ScanErrorsAndTenantPermissionsNeverChangeQuantity(){
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);var d=await ScanDoc(c,t,s,new ReceiptLineRequest(){ProductId=s.Serial,ExpectedQuantity=20});var url=t.Root+"/"+Id(Doc(d));
  foreach(var (value,status) in new[]{("MISSING",HttpStatusCode.NotFound),("WEIGHT",HttpStatusCode.BadRequest),("LOCATION",HttpStatusCode.BadRequest)})Assert.Equal(status,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode=value})).StatusCode);
  Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A",lineId=Guid.NewGuid()})).StatusCode);
  await Login(c,t,"Reader");Assert.Equal(HttpStatusCode.Forbidden,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
  await Login(c,t,"Other");Assert.Equal(HttpStatusCode.Forbidden,(await c.GetAsync(url+"/inspection-history")).StatusCode);Assert.Equal(HttpStatusCode.NotFound,(await AuthTests.Post(c,$"/api/tenants/{t.Other}/receipts/{Id(Doc(d))}/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"})).StatusCode);
  using var verify=f.Services.CreateScope();var db=verify.ServiceProvider.GetRequiredService<WmsDbContext>();Assert.Null((await db.InboundReceiptLines.SingleAsync()).InspectedQuantity);
 }
 [Fact] public async Task MultipleLotRowsRequireExplicitSelectionAndMeasurementNeedsManualQuantity(){
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);var d=await ScanDoc(c,t,s,new ReceiptLineRequest(){ProductId=s.Serial,ExpectedQuantity=10,LotNumber="A"},new ReceiptLineRequest(){ProductId=s.Serial,ExpectedQuantity=10,LotNumber="B"},new ReceiptLineRequest(){ProductId=s.Bulk,ExpectedQuantity=5.5m});var url=t.Root+"/"+Id(Doc(d));var requestId=Guid.NewGuid();
  var select=await Post(c,url+"/scan-inspection",new{requestId,barcode="CANDY-A"},HttpStatusCode.OK);Assert.Equal("select-line",select.GetProperty("outcome").GetString());Assert.Equal(2,select.GetProperty("candidateLineIds").GetArrayLength());
  d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId,barcode="CANDY-A",lineId=Id(d.GetProperty("lines")[1])},HttpStatusCode.OK));Assert.Equal(JsonValueKind.Null,Line(d).GetProperty("inspectedQuantity").ValueKind);Assert.Equal(1,d.GetProperty("lines")[1].GetProperty("inspectedQuantity").GetDecimal());Assert.Equal("B",d.GetProperty("lines")[1].GetProperty("lotNumber").GetString());
  var measured=await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="WEIGHT"},HttpStatusCode.OK);Assert.Equal("manual",measured.GetProperty("outcome").GetString());Assert.Equal(JsonValueKind.Null,ScanDetail(measured).GetProperty("lines")[2].GetProperty("inspectedQuantity").ValueKind);
  var quantity=new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId=Id(d.GetProperty("lines")[2]),quantity=3.25m,reason="실제 계량"};d=ScanDetail(await Post(c,url+"/inspection-quantity",quantity,HttpStatusCode.OK));Assert.Equal(3.25m,d.GetProperty("lines")[2].GetProperty("inspectedQuantity").GetDecimal());await Post(c,url+"/inspection-quantity",quantity,HttpStatusCode.OK);
 }
 [Fact] public async Task UndoAndManualCorrectionsUseOneFieldAndRejectStaleOrInvalidReplay(){
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);var d=await ScanDoc(c,t,s,new ReceiptLineRequest(){ProductId=s.Serial,ExpectedQuantity=20});var url=t.Root+"/"+Id(Doc(d));var lineId=Id(Line(d));var requestId=Guid.NewGuid();
  d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId,barcode="CANDY-A"},HttpStatusCode.OK));Assert.Equal(1,Scanned(d));
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/scan-inspection",new{requestId,barcode="CANDY-B"})).StatusCode);
  var undo=new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId,undoScanRequestId=requestId,reason="스캔 실수"};d=ScanDetail(await Post(c,url+"/inspection-quantity",undo,HttpStatusCode.OK));Assert.Equal(0,Scanned(d));await Post(c,url+"/inspection-quantity",undo,HttpStatusCode.OK);
  Assert.Equal(HttpStatusCode.Conflict,(await AuthTests.Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId,undoScanRequestId=requestId,reason="중복 되돌리기"})).StatusCode);
  foreach(var q in new[]{-1m,21m,1.0001m})Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId,quantity=q,reason="수정"})).StatusCode);
  var correction=new{requestId=Guid.NewGuid(),version=Version(Doc(d)),lineId,quantity=7,reason="실물 재확인"};d=ScanDetail(await Post(c,url+"/inspection-quantity",correction,HttpStatusCode.OK));Assert.Equal(7,Scanned(d));
  d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-B"},HttpStatusCode.OK));Assert.Equal(8,Scanned(d));
  var history=await c.GetFromJsonAsync<JsonElement>(url+"/inspection-history");Assert.Contains(history.GetProperty("items").EnumerateArray(),h=>h.GetProperty("reason").GetString()=="실물 재확인");Assert.DoesNotContain("scanRequestHash",history.ToString());
 }
 [Fact] public async Task PartialSerialScansPreserveTrackingAndFinalInspectionValidatesSerialCount(){
  using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);var s=await Setup(f,t);await ScanLabels(f,t,s);await Login(c,t);var d=await ScanDoc(c,t,s,Request(s,true).Lines);var url=t.Root+"/"+Id(Doc(d));
  d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK));Assert.Equal(2,Line(d).GetProperty("serials").GetArrayLength());Assert.Equal("LOT-A",Line(d).GetProperty("lotNumber").GetString());
  Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),quantity=1,serials=new[]{"SN-1","SN-2"}}}})).StatusCode);
  d=ScanDetail(await Post(c,url+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="CANDY-A"},HttpStatusCode.OK));await Post(c,url+"/inspection",new{version=Version(Doc(d)),lines=new[]{new{lineId=Id(Line(d)),quantity=2,lotNumber="LOT-A",expiryDate="2027-01-01",serials=new[]{"SN-1","SN-2"}}}},HttpStatusCode.OK);
 }
 [Theory][InlineData("EA",true)][InlineData("PCS",true)][InlineData("BOX",true)][InlineData("PACK",true)][InlineData("kg",false)][InlineData("g",false)][InlineData("L",false)][InlineData("ml",false)][InlineData("m",false)][InlineData("UNKNOWN",false)]
 public void CountScanPolicyDoesNotGuessMeasuredOrUnknownUnits(string unit,bool expected)=>Assert.Equal(expected,ReceiptService.CanCountScan(unit));
}
