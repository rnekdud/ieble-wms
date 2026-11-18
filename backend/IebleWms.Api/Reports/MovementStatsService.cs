using System.Data;
using System.Runtime.CompilerServices;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
namespace IebleWms.Api.Reports;

public sealed class MovementStatsService(WmsDbContext db,TimeProvider clock,IOptions<StockOverviewOptions> options)
{
 public const string TimeZone="Asia/Seoul";
 readonly DateOnly today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(),TimeZoneInfo.FindSystemTimeZoneById(TimeZone)).Date);
 static OrganizationException Error(string message,int status=400)=>new(status,message);
 public (DateOnly start,DateOnly end,string bucket) Range(MovementStatsQuery q)
 {
  var end=q.End??today;if(end.Year<1900||end.Year>9998)throw Error("조회 종료일을 확인해 주세요.");var start=q.Start??end.AddDays(-29);
  if(start>end||end.DayNumber-start.DayNumber>3660||start.Year<1900||end.Year>9998||q.Page<1||q.Page>100000||q.PageSize is not(20 or 50 or 100)||q.View is not("product" or "warehouse" or "partner" or "detail")||q.Direction is not("all" or "receipt" or "shipment")||q.Bucket is not("auto" or "day" or "week" or "month")||q.Search?.Length>100||q.Unit?.Length>16)throw Error("조회 기간과 조건을 확인해 주세요. 최대 10년까지 조회할 수 있습니다.");
  var bucket=q.Bucket=="auto"?(end.DayNumber-start.DayNumber>180?"month":end.DayNumber-start.DayNumber>60?"week":"day"):q.Bucket;
  return(start,end,bucket);
 }
 async Task<IDbContextTransaction> Snapshot(CancellationToken ct){var tx=await db.Database.BeginTransactionAsync(db.Database.IsNpgsql()?IsolationLevel.RepeatableRead:IsolationLevel.Serializable,ct);if(db.Database.IsNpgsql())await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY",ct);return tx;}
 public IQueryable<MovementFact> Facts(Guid tenant,MovementStatsQuery q)
 {
  var (start,end,_)=Range(q);var zone=TimeZoneInfo.FindSystemTimeZoneById(TimeZone);
  var from=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(start.ToDateTime(TimeOnly.MinValue),zone));var until=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(end.AddDays(1).ToDateTime(TimeOnly.MinValue),zone));
  // Provider-specific date projection only; all user values are bound parameters. No model/table is added.
  var pg=db.Database.IsNpgsql();
  var stamp=pg?"to_char(d.\"ConfirmedAt\" AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')":"strftime('%Y-%m-%dT%H:%M:%fZ',d.\"ConfirmedAt\")";
  var day=pg?"to_char(d.\"ConfirmedAt\" AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')":"date(d.\"ConfirmedAt\",'+9 hours')";
  var time=pg?"d.\"ConfirmedAt\">={1} AND d.\"ConfirmedAt\"<{2}":"julianday(d.\"ConfirmedAt\")>=julianday({1}) AND julianday(d.\"ConfirmedAt\")<julianday({2})";
  string Part(bool inbound)=>$"""
   SELECT {(inbound?"l":"a")}."Id" AS "RowId", d."Id" AS "DocumentId", d."Number", '{(inbound?"receipt":"shipment")}' AS "Direction",
   {stamp} AS "ConfirmedAt", {day} AS "Day", u."DisplayName" AS "ActorName",
   p."Id" AS "ProductId",p."Code" AS "ProductCode",p."Name" AS "ProductName",p."CategoryId",c."Name" AS "CategoryName",
   w."Id" AS "WarehouseId",w."Code" AS "WarehouseCode",d."WarehouseName",
   b."Id" AS "PartnerId",b."Code" AS "PartnerCode",d."PartnerName",b."Type" AS "PartnerType",
   l."Unit", {(inbound?"l.\"InspectedQuantity\"":"a.\"InspectedQuantity\"")} AS "Quantity",
   {(inbound?"l":"a")}."LotNumber",{(inbound?"l":"a")}."ExpiryDate",{(inbound?"CAST(NULL AS TEXT)":"a.\"SerialNumber\"")} AS "SerialNumber"
   FROM "{(inbound?"InboundReceipts":"OutboundShipments")}" d
   JOIN "{(inbound?"InboundReceiptLines":"OutboundShipmentLines")}" l ON l."TenantId"=d."TenantId" AND l."{(inbound?"ReceiptId":"ShipmentId")}"=d."Id"
   {(inbound?"":"JOIN \"ShipmentAllocations\" a ON a.\"TenantId\"=l.\"TenantId\" AND a.\"LineId\"=l.\"Id\" AND a.\"State\"='Consumed'")}
   JOIN "Products" p ON p."TenantId"=l."TenantId" AND p."Id"=l."ProductId"
   LEFT JOIN "ProductCategories" c ON c."TenantId"=p."TenantId" AND c."Id"=p."CategoryId"
   JOIN "Warehouses" w ON w."TenantId"=d."TenantId" AND w."Id"=d."WarehouseId"
   JOIN "Partners" b ON b."TenantId"=d."TenantId" AND b."Id"=d."PartnerId"
   JOIN "AspNetUsers" u ON u."Id"=d."ConfirmedByUserId"
   WHERE d."TenantId"={"{0}"} AND d."Status"='Confirmed' AND {time} AND {(inbound?"l":"a")}."InspectedQuantity">0
   """;
  var sql=Part(true)+" UNION ALL "+Part(false);
  var rows=db.Database.SqlQuery<MovementFact>(FormattableStringFactory.Create(sql,tenant,from,until));
  if(q.Direction!="all")rows=rows.Where(x=>x.Direction==q.Direction);if(q.ProductId.HasValue)rows=rows.Where(x=>x.ProductId==q.ProductId);if(q.WarehouseId.HasValue)rows=rows.Where(x=>x.WarehouseId==q.WarehouseId);if(q.PartnerId.HasValue)rows=rows.Where(x=>x.PartnerId==q.PartnerId);if(q.CategoryId.HasValue)rows=rows.Where(x=>x.CategoryId==q.CategoryId);if(q.DocumentId.HasValue)rows=rows.Where(x=>x.DocumentId==q.DocumentId);if(q.Unit!=null)rows=rows.Where(x=>x.Unit==q.Unit);
  if(!string.IsNullOrWhiteSpace(q.Search)){var term=q.Search.Trim().ToLowerInvariant();rows=rows.Where(x=>x.Number.ToLower().Contains(term)||x.ProductCode.ToLower().Contains(term)||x.ProductName.ToLower().Contains(term)||x.PartnerName.ToLower().Contains(term)||(x.LotNumber!=null&&x.LotNumber.ToLower().Contains(term))||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.ProductId&&b.Value.ToLower().Contains(term))||(x.Direction=="receipt"&&db.StockMovements.Any(m=>m.TenantId==tenant&&m.ReceiptId==x.DocumentId&&db.StockBalances.Any(s=>s.TenantId==tenant&&s.Id==m.StockId&&s.ProductId==x.ProductId&&s.LotNumber==x.LotNumber&&s.ExpiryDate==x.ExpiryDate&&s.SerialNumber!=null&&s.SerialNumber.ToLower().Contains(term)))));}return rows;
 }
 public IQueryable<MovementStatsRow> Grouped(IQueryable<MovementFact> facts,string view)
 {
  var product=view=="product";var warehouse=view=="warehouse";var pg=db.Database.IsNpgsql();
  return facts.GroupBy(x=>new{Id=product?x.ProductId:warehouse?x.WarehouseId:x.PartnerId,Unit=product?x.Unit:null}).Select(g=>new MovementStatsRow{
   Id=g.Key.Id,Unit=g.Key.Unit,Code=product?g.Max(x=>x.ProductCode)!:warehouse?g.Max(x=>x.WarehouseCode)!:g.Max(x=>x.PartnerCode)!,Name=product?g.Max(x=>x.ProductName)!:warehouse?g.Max(x=>x.WarehouseName)!:g.Max(x=>x.PartnerName)!,CategoryName=product?g.Max(x=>x.CategoryName):null,PartnerType=product||warehouse?null:g.Max(x=>x.PartnerType),
   Receipts=g.Where(x=>x.Direction=="receipt").Select(x=>x.DocumentId).Distinct().Count(),Shipments=g.Where(x=>x.Direction=="shipment").Select(x=>x.DocumentId).Distinct().Count(),ReceiptProducts=g.Where(x=>x.Direction=="receipt").Select(x=>x.ProductId).Distinct().Count(),ShipmentProducts=g.Where(x=>x.Direction=="shipment").Select(x=>x.ProductId).Distinct().Count(),
   ReceiptQuantity=product?(pg?g.Sum(x=>x.Direction=="receipt"?x.Quantity:0):(decimal)Math.Round(g.Sum(x=>x.Direction=="receipt"?(double)x.Quantity:0),3)):0,
   ShipmentQuantity=product?(pg?g.Sum(x=>x.Direction=="shipment"?x.Quantity:0):(decimal)Math.Round(g.Sum(x=>x.Direction=="shipment"?(double)x.Quantity:0),3)):0,LastProcessedAt=g.Max(x=>x.ConfirmedAt)});
 }
 static IOrderedQueryable<MovementFact> Ordered(IQueryable<MovementFact> rows)=>rows.OrderByDescending(x=>x.ConfirmedAt).ThenBy(x=>x.Direction).ThenBy(x=>x.DocumentId).ThenBy(x=>x.RowId);
 async Task<object> Summary(IQueryable<MovementFact> rows,CancellationToken ct)=>new{receipts=await rows.Where(x=>x.Direction=="receipt").Select(x=>x.DocumentId).Distinct().CountAsync(ct),shipments=await rows.Where(x=>x.Direction=="shipment").Select(x=>x.DocumentId).Distinct().CountAsync(ct),receiptProducts=await rows.Where(x=>x.Direction=="receipt").Select(x=>x.ProductId).Distinct().CountAsync(ct),shipmentProducts=await rows.Where(x=>x.Direction=="shipment").Select(x=>x.ProductId).Distinct().CountAsync(ct)};
 internal async Task<List<MovementTrend>> Trend(IQueryable<MovementFact> rows,MovementStatsQuery q,CancellationToken ct)
 {
  var (start,end,bucket)=Range(q);
  // SQL returns at most one row per day; zero-fill and calendar bucket boundaries are handled once on the server.
  var daily=await rows.GroupBy(x=>x.Day).Select(g=>new{Day=g.Key,Receipts=g.Where(x=>x.Direction=="receipt").Select(x=>x.DocumentId).Distinct().Count(),Shipments=g.Where(x=>x.Direction=="shipment").Select(x=>x.DocumentId).Distinct().Count()}).ToListAsync(ct);
  var byDay=daily.ToDictionary(x=>DateOnly.Parse(x.Day));var result=new List<MovementTrend>();var cursor=start;
  while(cursor<=end){var last=bucket=="month"?new DateOnly(cursor.Year,cursor.Month,DateTime.DaysInMonth(cursor.Year,cursor.Month)):bucket=="week"?cursor.AddDays(6-((int)cursor.DayOfWeek+6)%7):cursor;if(last>end)last=end;var receipts=0;var shipments=0;for(var day=cursor;day<=last;day=day.AddDays(1))if(byDay.TryGetValue(day,out var counts)){receipts+=counts.Receipts;shipments+=counts.Shipments;}result.Add(new(cursor.ToString("yyyy-MM-dd"),last.ToString("yyyy-MM-dd"),receipts,shipments));cursor=last.AddDays(1);}return result;
 }
 public async Task<object> List(Guid tenant,MovementStatsQuery q,CancellationToken ct)
 {
  await using var tx=await Snapshot(ct);var rows=Facts(tenant,q);var grouped=Grouped(rows,q.View);var total=q.View=="detail"?await rows.CountAsync(ct):await grouped.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(int)Math.Ceiling(total/(double)q.PageSize)));
  object items=q.View=="detail"?await Ordered(rows).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct):await grouped.OrderBy(x=>x.Code).ThenBy(x=>x.Id).ThenBy(x=>x.Unit).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);
  var summary=await Summary(rows,ct);var trend=await Trend(rows,q,ct);var (start,end,bucket)=Range(q);await tx.CommitAsync(ct);return new{items,total,page,pageSize=q.PageSize,summary,trend,start,end,bucket,today,timeZone=TimeZone,maxExportRows=options.Value.MaxExportRows};
 }
 public async Task<object> GetSummary(Guid tenant,MovementStatsQuery q,CancellationToken ct){await using var tx=await Snapshot(ct);var value=await Summary(Facts(tenant,q),ct);await tx.CommitAsync(ct);return value;}
 public async Task<object> GetTrend(Guid tenant,MovementStatsQuery q,CancellationToken ct){await using var tx=await Snapshot(ct);var value=await Trend(Facts(tenant,q),q,ct);await tx.CommitAsync(ct);return value;}
 public async Task<object> Choices(Guid tenant,string kind,string? search,int page,CancellationToken ct)
 {
  if(search?.Length>100||page<1||page>100000)throw Error("선택 조건을 확인해 주세요.");var term=search?.Trim().ToLowerInvariant()??"";
  IQueryable<StockOverviewService.Choice> rows=kind switch{
   "products"=>db.Products.Where(x=>x.TenantId==tenant).Select(x=>new StockOverviewService.Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
   "partners"=>db.Partners.Where(x=>x.TenantId==tenant).Select(x=>new StockOverviewService.Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
   "warehouses"=>db.Warehouses.Where(x=>x.TenantId==tenant).Select(x=>new StockOverviewService.Choice{Id=x.Id,Code=x.Code,Name=x.Name}),
   "categories"=>db.ProductCategories.Where(x=>x.TenantId==tenant).Select(x=>new StockOverviewService.Choice{Id=x.Id,Code="",Name=x.Name}),_=>throw Error("선택 항목을 확인해 주세요.")};
  rows=rows.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term));return new{items=await rows.OrderBy(x=>x.Code).ThenBy(x=>x.Name).ThenBy(x=>x.Id).Skip((page-1)*30).Take(30).ToListAsync(ct),total=await rows.CountAsync(ct),page};
 }
 public async Task<(Stream stream,string contentType,string filename)> Export(Guid tenant,MovementStatsQuery q,string format,CancellationToken ct)
 {
  if(format is not("csv" or "xlsx"))throw Error("CSV 또는 Excel 형식을 선택해 주세요.");await using var tx=await Snapshot(ct);var facts=Facts(tenant,q);var groups=Grouped(facts,q.View);var count=q.View=="detail"?await facts.CountAsync(ct):await groups.CountAsync(ct);if(count>options.Value.MaxExportRows)throw Error($"최대 {options.Value.MaxExportRows:N0}행까지 다운로드할 수 있습니다. 조회 조건을 좁혀 주세요.",413);
  var file=StockOverviewExport.CreateTemporaryStream();try{if(q.View=="detail")await StockOverviewExport.Write(file,Ordered(facts).AsAsyncEnumerable(),format,["확정일시 (KST)","구분","문서번호","거래처","창고","상품코드","상품명","LOT","유통기한","시리얼","단위","확정 수량","확정 담당자"],r=>[TimeZoneInfo.ConvertTime(DateTimeOffset.Parse(r.ConfirmedAt),TimeZoneInfo.FindSystemTimeZoneById(TimeZone)).ToString("yyyy-MM-dd HH:mm:ss"),r.Direction=="receipt"?"입고":"출고",r.Number,r.PartnerName,r.WarehouseName,r.ProductCode,r.ProductName,r.LotNumber,r.ExpiryDate?.ToString("yyyy-MM-dd"),r.SerialNumber,r.Unit,r.Quantity,r.ActorName],"입출고 상세",ct);
   else {var headers=q.View=="product"?new[]{"상품코드","상품명","분류","단위","입고 건수","입고 수량","출고 건수","출고 수량","수량 차이"}:q.View=="warehouse"?["창고코드","창고명","입고 건수","출고 건수","입고 상품 종류","출고 상품 종류"]:["거래처코드","거래처명","유형","입고 건수","출고 건수","최근 처리일시 (KST)"];
    await StockOverviewExport.Write(file,groups.OrderBy(x=>x.Code).ThenBy(x=>x.Id).ThenBy(x=>x.Unit).AsAsyncEnumerable(),format,headers,r=>q.View=="product"?[r.Code,r.Name,r.CategoryName,r.Unit,r.Receipts,r.ReceiptQuantity,r.Shipments,r.ShipmentQuantity,r.Difference]:q.View=="warehouse"?[r.Code,r.Name,r.Receipts,r.Shipments,r.ReceiptProducts,r.ShipmentProducts]:[r.Code,r.Name,r.PartnerType=="BOTH"?"매입·매출처":r.PartnerType=="SUPPLIER"?"매입처":"매출처",r.Receipts,r.Shipments,r.LastProcessedAt==null?null:TimeZoneInfo.ConvertTime(DateTimeOffset.Parse(r.LastProcessedAt),TimeZoneInfo.FindSystemTimeZoneById(TimeZone)).ToString("yyyy-MM-dd HH:mm:ss")],"입출고 통계",ct);}
   await tx.CommitAsync(ct);file.Position=0;return(file,format=="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",$"movement-stats-{q.View}.{format}");}catch{await file.DisposeAsync();throw;}
 }
}
