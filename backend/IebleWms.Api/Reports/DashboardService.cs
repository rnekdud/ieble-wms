using System.Data;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
namespace IebleWms.Api.Reports;

// One read-only snapshot, using the same inventory rows and confirmed-document facts as reports.
public sealed class DashboardService(WmsDbContext db,TimeProvider clock,IOptions<StockOverviewOptions> options)
{
 public static bool CanRead(IReadOnlyDictionary<string,string[]> grants,string feature)=>grants.TryGetValue(feature,out var actions)&&actions.Contains("menu")&&actions.Contains("read");
 public async Task<object> Read(Guid tenant,IReadOnlyDictionary<string,string[]> grants,int days,CancellationToken ct)
 {
  if(days is not(7 or 30))throw new OrganizationException(400,"조회 기간은 최근 7일 또는 30일을 선택해 주세요.");
  var products=CanRead(grants,"products");var warehouses=CanRead(grants,"warehouses");var receipts=CanRead(grants,"receipts");var shipments=CanRead(grants,"shipments");var stock=CanRead(grants,"stock-overview");var statistics=CanRead(grants,"movement-stats");
  await using var tx=await db.Database.BeginTransactionAsync(db.Database.IsNpgsql()?IsolationLevel.RepeatableRead:IsolationLevel.Serializable,ct);if(db.Database.IsNpgsql())await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY",ct);
  var overview=new StockOverviewService(db,clock,options);var stats=new MovementStatsService(db,clock,options);var today=stats.Range(new()).end;
  var name=await db.Tenants.Where(x=>x.Id==tenant).Select(x=>x.Name).SingleAsync(ct);
  var inbound=db.InboundReceipts.AsNoTracking().Where(x=>x.TenantId==tenant);var outbound=db.OutboundShipments.AsNoTracking().Where(x=>x.TenantId==tenant);
  var openIn=DashboardQueries.OpenReceipts(db,tenant);var openOut=DashboardQueries.OpenShipments(db,tenant);
  var low=overview.Rows(tenant,new(){Status="low"});var expiry=overview.Rows(tenant,new(){View="location"}).Where(x=>x.HasExpired||x.HasExpiring);
  var metrics=new{
   activeProducts=products?(int?)await db.Products.CountAsync(x=>x.TenantId==tenant&&x.IsActive,ct):null,
   activeWarehouses=warehouses?(int?)await db.Warehouses.CountAsync(x=>x.TenantId==tenant&&x.IsActive,ct):null,
   lowProducts=stock?(int?)await low.Select(x=>x.ProductId).Distinct().CountAsync(ct):null,
   openReceipts=receipts?(int?)await openIn.CountAsync(ct):null,openShipments=shipments?(int?)await openOut.CountAsync(ct):null,
   reservedShipments=shipments?(int?)await openOut.CountAsync(d=>db.OutboundShipmentLines.Any(l=>l.TenantId==tenant&&l.ShipmentId==d.Id&&db.ShipmentAllocations.Any(a=>a.TenantId==tenant&&a.LineId==l.Id&&a.State=="Active"&&a.Quantity>0)),ct):null};
  var confirmed=stats.Facts(tenant,new(){Start=today,End=today});
  object? todayReceipts=receipts?new{confirmed=await confirmed.Where(x=>x.Direction=="receipt").Select(x=>x.DocumentId).Distinct().CountAsync(ct),scheduled=await openIn.CountAsync(x=>x.ExpectedDate==today,ct),working=await openIn.CountAsync(x=>x.Status=="Inspecting",ct)}:null;
  object? todayShipments=shipments?new{confirmed=await confirmed.Where(x=>x.Direction=="shipment").Select(x=>x.DocumentId).Distinct().CountAsync(ct),scheduled=await openOut.CountAsync(x=>x.ExpectedDate==today,ct),working=await openOut.CountAsync(x=>x.Status=="Picking"||x.Status=="Picked"||x.Status=="Inspected",ct)}:null;
  var trendReceipts=statistics&&receipts;var trendShipments=statistics&&shipments;
  object? trend=null;if(trendReceipts||trendShipments){var q=new MovementStatsQuery{Start=today.AddDays(1-days),End=today,Bucket="day",Direction=trendReceipts&&trendShipments?"all":trendReceipts?"receipt":"shipment"};var rows=await stats.Trend(stats.Facts(tenant,q),q,ct);trend=rows.Select(x=>new{x.Start,x.End,receipts=trendReceipts?(int?)x.Receipts:null,shipments=trendShipments?(int?)x.Shipments:null}).ToArray();}
  var recent=new List<DashboardDocument>();
  if(receipts){var ordered=db.Database.IsNpgsql()?inbound.OrderByDescending(x=>x.UpdatedAt).ThenBy(x=>x.Id):inbound.OrderByDescending(x=>x.UpdatedAt.ToString()).ThenBy(x=>x.Id);recent.AddRange(await ordered.Take(10).Select(x=>new DashboardDocument{Id=x.Id,Direction="receipt",Number=x.Number,PartnerName=x.PartnerName,WarehouseName=x.WarehouseName,Status=x.Status,ExpectedDate=x.ExpectedDate,ConfirmedAt=x.ConfirmedAt,UpdatedAt=x.UpdatedAt}).ToListAsync(ct));}
  if(shipments){var ordered=db.Database.IsNpgsql()?outbound.OrderByDescending(x=>x.UpdatedAt).ThenBy(x=>x.Id):outbound.OrderByDescending(x=>x.UpdatedAt.ToString()).ThenBy(x=>x.Id);recent.AddRange(await ordered.Take(10).Select(x=>new DashboardDocument{Id=x.Id,Direction="shipment",Number=x.Number,PartnerName=x.PartnerName,WarehouseName=x.WarehouseName,Status=x.Status,ExpectedDate=x.ExpectedDate,ConfirmedAt=x.ConfirmedAt,UpdatedAt=x.UpdatedAt}).ToListAsync(ct));}
  var lowItems=stock?await low.OrderBy(x=>x.ProductCode).ThenBy(x=>x.ProductId).ThenBy(x=>x.Unit).Take(5).ToListAsync(ct):null;
  var expiryCount=stock?(int?)await expiry.CountAsync(ct):null;
  var expiryItems=stock?await expiry.OrderBy(x=>x.ExpiryDate).ThenBy(x=>x.ProductCode).ThenBy(x=>x.ProductId).ThenBy(x=>x.LocationId).ThenBy(x=>x.LotNumber).ThenBy(x=>x.SerialNumber).Take(5).ToListAsync(ct):null;
  await tx.CommitAsync(ct);return new{tenantId=tenant,name,asOf=clock.GetUtcNow(),today,days,timeZone=MovementStatsService.TimeZone,expirySoonDays=options.Value.ExpirySoonDays,access=new{products,warehouses,receipts,shipments,stock,statistics,trendReceipts,trendShipments},metrics,todayReceipts,todayShipments,trend,recent=receipts||shipments?recent.OrderByDescending(x=>x.UpdatedAt).ThenBy(x=>x.Direction).ThenBy(x=>x.Id).Take(10).ToArray():null,lowItems,expiryCount,expiryItems=expiryItems?.Select(x=>new{item=x,remainingDays=x.ExpiryDate!.Value.DayNumber-overview.Today.DayNumber}).ToArray()};
 }
 public sealed class DashboardDocument
 {
  public Guid Id{get;set;}public string Direction{get;set;}="";public string Number{get;set;}="";public string PartnerName{get;set;}="";public string WarehouseName{get;set;}="";public string Status{get;set;}="";public DateOnly ExpectedDate{get;set;}public DateTimeOffset? ConfirmedAt{get;set;}public DateTimeOffset UpdatedAt{get;set;}
 }
}
