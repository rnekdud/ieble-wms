using System.Data;
using System.Runtime.CompilerServices;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
namespace IebleWms.Api.Reports;

// A read-only projection of the original ledger. Historical positions come from original documents, never today's serial location.
public sealed class StockHistoryService(WmsDbContext db,TimeProvider clock,IOptions<StockOverviewOptions> options)
{
 readonly MovementStatsService periods=new(db,clock,options);
 static OrganizationException Error(string message,int status=400)=>new(status,message);
 public (DateOnly start,DateOnly end) Range(StockHistoryQuery q)
 {
  var (start,end,_)=periods.Range(new(){Start=q.Start,End=q.End,Page=q.Page,PageSize=q.PageSize});
  if(q.Type is not("all" or "receipt" or "shipment" or "move" or "increase" or "decrease" or "stocktake")||new[]{q.Search,q.Lot,q.Serial,q.Document}.Any(x=>x?.Length>100))throw Error("이력 조회 조건을 확인해 주세요.");return(start,end);
 }
 async Task<IDbContextTransaction> Snapshot(CancellationToken ct){var tx=await db.Database.BeginTransactionAsync(db.Database.IsNpgsql()?IsolationLevel.RepeatableRead:IsolationLevel.Serializable,ct);if(db.Database.IsNpgsql())await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY",ct);return tx;}
 public IQueryable<StockHistoryRow> Rows(Guid tenant,StockHistoryQuery q,bool usePeriod=true)
 {
  var(start,end)=Range(q);var zone=TimeZoneInfo.FindSystemTimeZoneById(MovementStatsService.TimeZone);var from=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(start.ToDateTime(TimeOnly.MinValue),zone));var until=new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(end.AddDays(1).ToDateTime(TimeOnly.MinValue),zone));var pg=db.Database.IsNpgsql();
  var stamp=pg?"to_char(m.\"CreatedAt\" AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')":"strftime('%Y-%m-%dT%H:%M:%fZ',m.\"CreatedAt\")";
  var time=!usePeriod?"1=1":pg?"m.\"CreatedAt\">={1} AND m.\"CreatedAt\"<{2}":"julianday(m.\"CreatedAt\")>=julianday({1}) AND julianday(m.\"CreatedAt\")<julianday({2})";
  // Receipt allocations retain LocationId. For serials match the recorded identifier; otherwise match the original placement ordinal.
  var placement=pg?"""
   (SELECT NULLIF(j.value->>'LocationId','')::uuid FROM jsonb_array_elements(rl."PlacementsJson"::jsonb) WITH ORDINALITY j(value,ordinal)
    WHERE (s."SerialNumber" IS NOT NULL AND (j.value->'Serials') ? s."SerialNumber") OR
     (s."SerialNumber" IS NULL AND s."SourceKey"=replace(rl."Id"::text,'-','')||':'||(j.ordinal-1)::text) LIMIT 1)
   """:"""
   (SELECT upper(json_extract(j.value,'$.LocationId')) FROM json_each(rl."PlacementsJson") j
    WHERE (s."SerialNumber" IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(j.value,'$.Serials') sn WHERE sn.value=s."SerialNumber")) OR
     (s."SerialNumber" IS NULL AND s."SourceKey"=lower(replace(rl."Id",'-',''))||':'||j.key) LIMIT 1)
   """;
  // Nonserial stock keeps its original LocationId. Serial stock can move in place: the first later move records its departure ID.
  // Tied, conflicting departure snapshots are deliberately unresolved; matching a reused location code would invent an ID.
  var shipmentLocation="""
   CASE WHEN a."StockId" IS NULL THEN NULL WHEN EXISTS(SELECT 1 FROM "InventoryOperations" nx WHERE nx."TenantId"=m."TenantId" AND nx."Type"='Move' AND nx."SourceStockId"=m."StockId" AND nx."CreatedAt">=m."CreatedAt") THEN
    (SELECT nx."SourceLocationId" FROM "InventoryOperations" nx WHERE nx."TenantId"=m."TenantId" AND nx."Type"='Move' AND nx."SourceStockId"=m."StockId" AND nx."CreatedAt"=(SELECT MIN(ny."CreatedAt") FROM "InventoryOperations" ny WHERE ny."TenantId"=m."TenantId" AND ny."Type"='Move' AND ny."SourceStockId"=m."StockId" AND ny."CreatedAt">=m."CreatedAt")
     AND NOT EXISTS(SELECT 1 FROM "InventoryOperations" nz WHERE nz."TenantId"=m."TenantId" AND nz."Type"='Move' AND nz."SourceStockId"=m."StockId" AND nz."CreatedAt"=nx."CreatedAt" AND nz."SourceLocationId"<>nx."SourceLocationId") ORDER BY nx."Id" LIMIT 1)
    ELSE CASE WHEN s."WarehouseId"=sh."WarehouseId" THEN s."LocationId" ELSE NULL END END
   """;
  var sql=$"""
   SELECT b."Id",b."StockId",b."Type",b."CreatedAt",b."Quantity",b."Unit",b."ProductId",b."ProductCode",b."ProductName",b."Barcode",
    b."WarehouseId",COALESCE(b."WarehouseSnapshot",w."Name") AS "WarehouseName",l."RackId",COALESCE(b."RackSnapshot",rk."Code") AS "RackCode",b."LocationId",COALESCE(b."LocationCodeSnapshot",l."Code") AS "LocationCode",b."LocationSnapshot",
    b."LotNumber",b."ExpiryDate",b."SerialNumber",b."ActorId",b."ActorName",b."Reason",b."DocumentKind",b."DocumentId",b."DocumentNumber",b."DocumentLinked"
   FROM (
    SELECT m."Id",m."TenantId",m."StockId",m."Type",{stamp} AS "CreatedAt",m."Quantity",COALESCE(o."Unit",t."Unit",rl."Unit",a."Unit",s."Unit") AS "Unit",
     s."ProductId",COALESCE(o."ProductCode",t."ProductCode",rl."ProductCode",a."ProductCode",p."Code") AS "ProductCode",COALESCE(o."ProductName",t."ProductName",rl."ProductName",a."ProductName",p."Name") AS "ProductName",p."Barcode",
     CASE WHEN m."Type"='MoveIn' THEN o."DestinationWarehouseId" WHEN o."Id" IS NOT NULL THEN o."SourceWarehouseId" WHEN r."Id" IS NOT NULL THEN r."WarehouseId" WHEN sh."Id" IS NOT NULL THEN sh."WarehouseId" WHEN t."Id" IS NOT NULL THEN t."WarehouseId" ELSE NULL END AS "WarehouseId",
     COALESCE(r."WarehouseName",sh."WarehouseName",st."WarehouseName") AS "WarehouseSnapshot",
     CASE WHEN m."Type"='MoveIn' THEN o."DestinationLocationId" WHEN o."Id" IS NOT NULL THEN o."SourceLocationId" WHEN r."Id" IS NOT NULL THEN {placement} WHEN sh."Id" IS NOT NULL THEN {shipmentLocation} WHEN t."Id" IS NOT NULL THEN t."LocationId" ELSE NULL END AS "LocationId",
     CASE WHEN sh."Id" IS NOT NULL THEN a."LocationCode" WHEN t."Id" IS NOT NULL THEN t."LocationCode" ELSE NULL END AS "LocationCodeSnapshot",
     CASE WHEN sh."Id" IS NOT NULL THEN a."RackCode" WHEN t."Id" IS NOT NULL THEN t."RackCode" ELSE NULL END AS "RackSnapshot",
     CASE WHEN m."Type"='MoveIn' THEN o."DestinationLabel" ELSE o."SourceLabel" END AS "LocationSnapshot",
     COALESCE(o."LotNumber",t."LotNumber",rl."LotNumber",a."LotNumber",s."LotNumber") AS "LotNumber",COALESCE(o."ExpiryDate",t."ExpiryDate",rl."ExpiryDate",a."ExpiryDate",s."ExpiryDate") AS "ExpiryDate",COALESCE(o."SerialNumber",t."SerialNumber",s."SerialNumber") AS "SerialNumber",
     m."ActorId",COALESCE(NULLIF(o."ActorName",''),u."DisplayName") AS "ActorName",COALESCE(o."Reason",t."Reason") AS "Reason",
     CASE WHEN m."ReceiptId" IS NOT NULL THEN 'receipt' WHEN m."ShipmentId" IS NOT NULL THEN 'shipment' WHEN m."OperationId" IS NOT NULL THEN 'operation' WHEN m."StocktakeId" IS NOT NULL THEN 'stocktake' ELSE 'unlinked' END AS "DocumentKind",
     COALESCE(m."ReceiptId",m."ShipmentId",m."OperationId",m."StocktakeId") AS "DocumentId",COALESCE(r."Number",sh."Number",o."Number",st."Number") AS "DocumentNumber",
     CASE WHEN COALESCE(r."Id",sh."Id",o."Id",st."Id") IS NOT NULL THEN TRUE ELSE FALSE END AS "DocumentLinked"
    FROM "StockMovements" m
    LEFT JOIN "StockBalances" s ON s."TenantId"=m."TenantId" AND s."Id"=m."StockId"
    LEFT JOIN "Products" p ON p."TenantId"=s."TenantId" AND p."Id"=s."ProductId"
    LEFT JOIN "InboundReceipts" r ON r."TenantId"=m."TenantId" AND r."Id"=m."ReceiptId"
    LEFT JOIN "InboundReceiptLines" rl ON rl."TenantId"=m."TenantId" AND rl."Id"=s."ReceiptLineId" AND rl."ReceiptId"=r."Id"
    LEFT JOIN "OutboundShipments" sh ON sh."TenantId"=m."TenantId" AND sh."Id"=m."ShipmentId"
    LEFT JOIN (SELECT al."TenantId",ln."ShipmentId",al."StockId",MAX(al."LocationCode") AS "LocationCode",MAX(al."RackCode") AS "RackCode",MAX(al."LotNumber") AS "LotNumber",MAX(al."ExpiryDate") AS "ExpiryDate",MAX(ln."Unit") AS "Unit",MAX(ln."ProductCode") AS "ProductCode",MAX(ln."ProductName") AS "ProductName"
     FROM "ShipmentAllocations" al JOIN "OutboundShipmentLines" ln ON ln."TenantId"=al."TenantId" AND ln."Id"=al."LineId" WHERE al."TenantId"={"{0}"} AND al."State"='Consumed' GROUP BY al."TenantId",ln."ShipmentId",al."StockId") a ON a."TenantId"=m."TenantId" AND a."ShipmentId"=sh."Id" AND a."StockId"=m."StockId"
    LEFT JOIN "InventoryOperations" o ON o."TenantId"=m."TenantId" AND o."Id"=m."OperationId"
    LEFT JOIN "Stocktakes" st ON st."TenantId"=m."TenantId" AND st."Id"=m."StocktakeId"
    LEFT JOIN "StocktakeTargets" t ON t."TenantId"=m."TenantId" AND t."StocktakeId"=st."Id" AND t."StockId"=m."StockId" AND NOT t."Excluded"
    LEFT JOIN "AspNetUsers" u ON u."Id"=m."ActorId"
    WHERE m."TenantId"={"{0}"} AND {time} AND m."Quantity"<>0
     AND m."Type" IN ('ReceiptConfirmed','ShipmentConfirmed','MoveIn','MoveOut','AdjustmentIncrease','AdjustmentDecrease','StocktakeIncrease','StocktakeDecrease')
     AND (r."Id" IS NULL OR r."Status"='Confirmed') AND (sh."Id" IS NULL OR sh."Status"='Confirmed') AND (st."Id" IS NULL OR st."Status"='Confirmed')
   ) b
   LEFT JOIN "Warehouses" w ON w."TenantId"=b."TenantId" AND w."Id"=b."WarehouseId"
   LEFT JOIN "StorageLocations" l ON l."TenantId"=b."TenantId" AND l."WarehouseId"=b."WarehouseId" AND l."Id"=b."LocationId"
   LEFT JOIN "WarehouseRacks" rk ON rk."TenantId"=b."TenantId" AND rk."WarehouseId"=b."WarehouseId" AND rk."Id"=l."RackId"
   """;
  var rows=db.Database.SqlQuery<StockHistoryRow>(FormattableStringFactory.Create(sql,tenant,from,until));
  rows=q.Type switch{"receipt"=>rows.Where(x=>x.Type=="ReceiptConfirmed"),"shipment"=>rows.Where(x=>x.Type=="ShipmentConfirmed"),"move"=>rows.Where(x=>x.Type=="MoveIn"||x.Type=="MoveOut"),"increase"=>rows.Where(x=>x.Type=="AdjustmentIncrease"),"decrease"=>rows.Where(x=>x.Type=="AdjustmentDecrease"),"stocktake"=>rows.Where(x=>x.Type=="StocktakeIncrease"||x.Type=="StocktakeDecrease"),_=>rows};
  if(q.WarehouseId.HasValue)rows=rows.Where(x=>x.WarehouseId==q.WarehouseId);if(q.RackId.HasValue)rows=rows.Where(x=>x.RackId==q.RackId);if(q.LocationId.HasValue)rows=rows.Where(x=>x.LocationId==q.LocationId);if(q.ActorId.HasValue)rows=rows.Where(x=>x.ActorId==q.ActorId);
  if(!string.IsNullOrWhiteSpace(q.Search)){var term=q.Search.Trim().ToLowerInvariant();rows=rows.Where(x=>(x.DocumentNumber!=null&&x.DocumentNumber.ToLower().Contains(term))||(x.ProductCode!=null&&x.ProductCode.ToLower().Contains(term))||(x.ProductName!=null&&x.ProductName.ToLower().Contains(term))||(x.LotNumber!=null&&x.LotNumber.ToLower().Contains(term))||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.ProductId&&b.Value.ToLower().Contains(term)));}
  if(!string.IsNullOrWhiteSpace(q.Document)){var term=q.Document.Trim().ToLowerInvariant();rows=rows.Where(x=>x.DocumentNumber!=null&&x.DocumentNumber.ToLower().Contains(term));}if(!string.IsNullOrWhiteSpace(q.Lot)){var term=q.Lot.Trim().ToLowerInvariant();rows=rows.Where(x=>x.LotNumber!=null&&x.LotNumber.ToLower().Contains(term));}if(!string.IsNullOrWhiteSpace(q.Serial)){var term=q.Serial.Trim().ToLowerInvariant();rows=rows.Where(x=>x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term));}return rows;
 }
 static IOrderedQueryable<StockHistoryRow> Ordered(IQueryable<StockHistoryRow> rows)=>rows.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id);
 static async Task<object> Summary(IQueryable<StockHistoryRow> rows,CancellationToken ct)=>new{
  rows=await rows.CountAsync(ct),receiptRows=await rows.CountAsync(x=>x.Type=="ReceiptConfirmed",ct),shipmentRows=await rows.CountAsync(x=>x.Type=="ShipmentConfirmed",ct),operationRows=await rows.CountAsync(x=>x.Type=="MoveIn"||x.Type=="MoveOut"||x.Type=="AdjustmentIncrease"||x.Type=="AdjustmentDecrease",ct),stocktakeRows=await rows.CountAsync(x=>x.Type=="StocktakeIncrease"||x.Type=="StocktakeDecrease",ct),
  workCount=await rows.Select(x=>new{x.DocumentKind,Id=x.DocumentId??x.Id}).Distinct().CountAsync(ct)};
 public async Task<object> List(Guid tenant,StockHistoryQuery q,CancellationToken ct){await using var tx=await Snapshot(ct);var rows=Rows(tenant,q);var total=await rows.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(int)Math.Ceiling(total/(double)q.PageSize)));var items=await Ordered(rows).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);var summary=await Summary(rows,ct);var(start,end)=Range(q);var today=periods.Range(new(){Start=null,End=null}).end;await tx.CommitAsync(ct);return new{items,total,page,pageSize=q.PageSize,summary,start,end,today,timeZone=MovementStatsService.TimeZone,maxExportRows=options.Value.MaxExportRows};}
 public async Task<object> GetSummary(Guid tenant,StockHistoryQuery q,CancellationToken ct){await using var tx=await Snapshot(ct);var result=await Summary(Rows(tenant,q),ct);await tx.CommitAsync(ct);return result;}
 public async Task<object> Detail(Guid tenant,Guid id,int page,CancellationToken ct)
 {
  if(page<1||page>100000)throw Error("페이지를 확인해 주세요.");await using var tx=await Snapshot(ct);var all=Rows(tenant,new(),false);var row=await all.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw Error("변동 기록을 찾을 수 없습니다.",404);
  object? document=null;object? operation=null;object? countTarget=null;
  if(row.DocumentLinked)switch(row.DocumentKind){
   case "receipt":document=await db.InboundReceipts.AsNoTracking().Where(x=>x.TenantId==tenant&&x.Id==row.DocumentId).Select(x=>new{x.Id,x.Number,x.Status,x.PartnerName,x.WarehouseName,x.ContactName,x.Notes,x.ExpectedDate,x.ConfirmedAt,x.ConfirmedByUserId}).SingleOrDefaultAsync(ct);break;
   case "shipment":document=await db.OutboundShipments.AsNoTracking().Where(x=>x.TenantId==tenant&&x.Id==row.DocumentId).Select(x=>new{x.Id,x.Number,x.Status,x.PartnerName,x.WarehouseName,x.ContactName,x.Notes,x.RequestDate,x.ExpectedDate,x.ConfirmedAt,x.ConfirmedByUserId}).SingleOrDefaultAsync(ct);break;
   case "operation":operation=await db.InventoryOperations.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==row.DocumentId,ct);break;
   case "stocktake":document=await db.Stocktakes.AsNoTracking().Where(x=>x.TenantId==tenant&&x.Id==row.DocumentId).Select(x=>new{x.Id,x.Number,x.Name,x.Status,x.WarehouseName,x.ScopeLabel,x.BasisAt,x.SnapshotAt,x.ContactName,x.Notes,x.ConfirmedAt,x.ConfirmedBy}).SingleOrDefaultAsync(ct);countTarget=await db.StocktakeTargets.AsNoTracking().Where(x=>x.TenantId==tenant&&x.StocktakeId==row.DocumentId&&x.StockId==row.StockId&&!x.Excluded).Select(x=>new{x.Id,x.OriginalQuantity,x.OriginalSnapshotAt,x.BaselineQuantity,x.BaselineAt,x.CountedQuantity,x.Reason,x.ObservedSerial}).SingleOrDefaultAsync(ct);break;
  }
  var related=row.DocumentId.HasValue?all.Where(x=>x.DocumentKind==row.DocumentKind&&x.DocumentId==row.DocumentId):all.Where(x=>x.Id==id);var total=await related.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/20d)));var items=await Ordered(related).Skip((page-1)*20).Take(20).ToListAsync(ct);await tx.CommitAsync(ct);return new{row,document,operation,countTarget,related=items,total,page,pageSize=20};
 }
 public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,Guid? rackId,int page,CancellationToken ct)
 {
  if(kind!="actors")return await new StockOverviewService(db,clock,options).Choices(tenant,kind,search,warehouseId,null,rackId,page,ct);
  if(search?.Length>100||page<1||page>100000)throw Error("담당자 검색 조건을 확인해 주세요.");var term=search?.Trim().ToLowerInvariant()??"";
  var actors=db.Users.AsNoTracking().Where(x=>db.StockMovements.Any(m=>m.TenantId==tenant&&m.ActorId==x.Id)&&x.DisplayName.ToLower().Contains(term));return new{items=await actors.OrderBy(x=>x.DisplayName).ThenBy(x=>x.Id).Skip((page-1)*30).Take(30).Select(x=>new{id=x.Id,code="",name=x.DisplayName}).ToListAsync(ct),total=await actors.CountAsync(ct),page};
 }
 public async Task<(Stream stream,string contentType,string filename)> Export(Guid tenant,StockHistoryQuery q,string format,CancellationToken ct)
 {
  if(format is not("csv" or "xlsx"))throw Error("CSV 또는 Excel 형식을 선택해 주세요.");await using var tx=await Snapshot(ct);var rows=Rows(tenant,q);if(await rows.CountAsync(ct)>options.Value.MaxExportRows)throw Error($"최대 {options.Value.MaxExportRows:N0}행까지 다운로드할 수 있습니다. 조회 조건을 좁혀 주세요.",413);
  var file=StockOverviewExport.CreateTemporaryStream();try{await StockOverviewExport.Write(file,Ordered(rows).AsAsyncEnumerable(),format,["처리일시 (KST)","변동 유형","문서번호","상품코드","상품명","창고","랙","보관 위치","LOT","유통기한","시리얼","증감 수량","기준 단위","처리 사유","처리 담당자"],x=>[TimeZoneInfo.ConvertTime(DateTimeOffset.Parse(x.CreatedAt),TimeZoneInfo.FindSystemTimeZoneById(MovementStatsService.TimeZone)).ToString("yyyy-MM-dd HH:mm:ss"),StockHistoryTypes.Label(x.Type),x.DocumentNumber,x.ProductCode,x.ProductName,x.WarehouseName,x.RackCode,x.LocationCode,x.LotNumber,x.ExpiryDate?.ToString("yyyy-MM-dd"),x.SerialNumber,x.Quantity,x.Unit,x.Reason,x.ActorName],"재고 변동 이력",ct);await tx.CommitAsync(ct);file.Position=0;return(file,format=="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",$"stock-history.{format}");}catch{await file.DisposeAsync();throw;}
 }
}
