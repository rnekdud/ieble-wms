using System.Data;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
namespace IebleWms.Api.Reports;

// Read-only projections of the existing inventory. No cached or duplicate inventory ledger.
public sealed class StockOverviewService(WmsDbContext db,TimeProvider clock,IOptions<StockOverviewOptions> configuration)
{
 readonly StockOverviewOptions options=configuration.Value;
 readonly DateTimeOffset asOf=clock.GetUtcNow();
 public DateOnly Today=>DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(asOf,TimeZoneInfo.FindSystemTimeZoneById(options.TimeZoneId)).Date);
 static OrganizationException Error(string text,int status=400)=>new(status,text);
 static void Validate(StockOverviewQuery q)
 {
  if(q.View is not ("product" or "warehouse" or "location")||q.Status is not ("all" or "normal" or "low" or "zero" or "expiring" or "expired" or "reserved")||q.Active is not ("all" or "active" or "inactive")||q.Page<1||q.Page>100000||q.PageSize is not (20 or 50 or 100)||q.Search?.Length>100||q.Lot?.Length>100||q.LotExact?.Length>100||q.SerialExact?.Length>100||q.Unit?.Length>16)throw Error("재고 현황 조회 조건을 확인해 주세요.");
 }
 async Task<IDbContextTransaction> Snapshot(CancellationToken ct)
 {
  var tx=await db.Database.BeginTransactionAsync(db.Database.IsNpgsql()?IsolationLevel.RepeatableRead:IsolationLevel.Serializable,ct);
  if(db.Database.IsNpgsql())await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY",ct);return tx;
 }
 IQueryable<Product> Products(Guid tenant,StockOverviewQuery q)
 {
  var p=db.Products.AsNoTracking().Where(x=>x.TenantId==tenant);var term=q.Search?.Trim().ToLowerInvariant();
  if(!string.IsNullOrEmpty(term))p=p.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.Id&&b.Value.ToLower().Contains(term))||db.StockBalances.Any(s=>s.TenantId==tenant&&s.ProductId==x.Id&&((s.LotNumber!=null&&s.LotNumber.ToLower().Contains(term))||(s.SerialNumber!=null&&s.SerialNumber.ToLower().Contains(term)))));
  if(q.CategoryId.HasValue)p=p.Where(x=>x.CategoryId==q.CategoryId);if(q.ProductId.HasValue)p=p.Where(x=>x.Id==q.ProductId);if(q.Active!="all")p=p.Where(x=>x.IsActive==(q.Active=="active"));return p;
 }
 sealed class Cell
 {
  public Guid StockId{get;set;} public Guid ProductId{get;set;} public Guid WarehouseId{get;set;} public string WarehouseName{get;set;}="";
  public Guid? ZoneId{get;set;} public string? ZoneName{get;set;} public Guid? RackId{get;set;} public string? RackCode{get;set;} public string? RackName{get;set;}
  public Guid LocationId{get;set;} public string LocationCode{get;set;}=""; public string LocationName{get;set;}="";
  public string Unit{get;set;}="";public string? LotNumber{get;set;}public DateOnly? ExpiryDate{get;set;}public string? SerialNumber{get;set;}
  public decimal Quantity{get;set;}public decimal ReservedQuantity{get;set;}public bool Expired{get;set;}public bool Expiring{get;set;}
 }
 IQueryable<Cell> Cells(Guid tenant,StockOverviewQuery q)
 {
  var today=Today;var soon=today.AddDays(options.ExpirySoonDays);
  var cells=from s in db.StockBalances.AsNoTracking() where s.TenantId==tenant
    join p in Products(tenant,q) on s.ProductId equals p.Id
    join w in db.Warehouses on new{s.TenantId,Id=s.WarehouseId} equals new{w.TenantId,w.Id}
    join l in db.StorageLocations on new{s.TenantId,s.WarehouseId,Id=s.LocationId} equals new{l.TenantId,l.WarehouseId,l.Id}
    join r in db.WarehouseRacks on new{l.TenantId,l.WarehouseId,Id=l.RackId} equals new{r.TenantId,r.WarehouseId,Id=(Guid?)r.Id} into racks from r in racks.DefaultIfEmpty()
    join z in db.WarehouseZones on new{l.TenantId,l.WarehouseId,Id=l.ZoneId??r.ZoneId} equals new{z.TenantId,z.WarehouseId,Id=(Guid?)z.Id} into zones from z in zones.DefaultIfEmpty()
    select new Cell{StockId=s.Id,ProductId=p.Id,WarehouseId=w.Id,WarehouseName=w.Name,ZoneId=(Guid?)z.Id,ZoneName=z.Name,RackId=l.RackId,RackCode=r.Code,RackName=r.Name,LocationId=l.Id,LocationCode=l.Code,LocationName=l.Name,Unit=s.Unit,LotNumber=s.LotNumber,ExpiryDate=s.ExpiryDate,SerialNumber=s.SerialNumber,Quantity=s.Quantity,ReservedQuantity=s.ReservedQuantity,Expired=s.Quantity>0&&s.ExpiryDate!=null&&s.ExpiryDate<today,Expiring=s.Quantity>0&&s.ExpiryDate!=null&&s.ExpiryDate>=today&&s.ExpiryDate<=soon};
  if(q.WarehouseId.HasValue)cells=cells.Where(x=>x.WarehouseId==q.WarehouseId);if(q.ZoneId.HasValue)cells=cells.Where(x=>x.ZoneId==q.ZoneId);if(q.RackId.HasValue)cells=cells.Where(x=>x.RackId==q.RackId);if(q.LocationId.HasValue)cells=cells.Where(x=>x.LocationId==q.LocationId);
  if(!string.IsNullOrWhiteSpace(q.Search)) {
   var term=q.Search.Trim().ToLowerInvariant();
   cells=cells.Where(x=>(x.LotNumber!=null&&x.LotNumber.ToLower().Contains(term))||(x.SerialNumber!=null&&x.SerialNumber.ToLower().Contains(term))||db.Products.Any(p=>p.TenantId==tenant&&p.Id==x.ProductId&&(p.Name.ToLower().Contains(term)||p.Code.ToLower().Contains(term)))||db.StorageBarcodes.Any(b=>b.TenantId==tenant&&b.ProductId==x.ProductId&&b.Value.ToLower().Contains(term)));
  }
  if(!string.IsNullOrWhiteSpace(q.Lot)){var lot=q.Lot.Trim().ToLowerInvariant();cells=cells.Where(x=>x.LotNumber!=null&&x.LotNumber.ToLower().Contains(lot));}
  if(q.Trace)cells=cells.Where(x=>x.LotNumber==q.LotExact&&x.ExpiryDate==q.ExpiryExact&&x.SerialNumber==q.SerialExact);if(q.Unit!=null)cells=cells.Where(x=>x.Unit==q.Unit);return cells;
 }
 internal IQueryable<StockOverviewRow> Rows(Guid tenant,StockOverviewQuery q)
 {
  Validate(q);var pg=db.Database.IsNpgsql();var byProduct=q.View=="product";var byLocation=q.View=="location";
  var grouped=Cells(tenant,q).GroupBy(x=>new{x.ProductId,x.Unit,WarehouseId=byProduct?(Guid?)null:x.WarehouseId,WarehouseName=byProduct?null:x.WarehouseName,ZoneId=byLocation?x.ZoneId:null,ZoneName=byLocation?x.ZoneName:null,RackId=byLocation?x.RackId:null,RackCode=byLocation?x.RackCode:null,RackName=byLocation?x.RackName:null,LocationId=byLocation?(Guid?)x.LocationId:null,LocationCode=byLocation?x.LocationCode:null,LocationName=byLocation?x.LocationName:null,LotNumber=byLocation?x.LotNumber:null,ExpiryDate=byLocation?x.ExpiryDate:null,SerialNumber=byLocation?x.SerialNumber:null})
   .Select(g=>new{g.Key.ProductId,g.Key.Unit,g.Key.WarehouseId,g.Key.WarehouseName,g.Key.ZoneId,g.Key.ZoneName,g.Key.RackId,g.Key.RackCode,g.Key.RackName,g.Key.LocationId,g.Key.LocationCode,g.Key.LocationName,g.Key.LotNumber,g.Key.ExpiryDate,g.Key.SerialNumber,
    Quantity=pg?g.Sum(x=>x.Quantity):(decimal)Math.Round(g.Sum(x=>(double)x.Quantity),3),Reserved=pg?g.Sum(x=>x.ReservedQuantity):(decimal)Math.Round(g.Sum(x=>(double)x.ReservedQuantity),3),Expired=g.Any(x=>x.Expired),Expiring=g.Any(x=>x.Expiring)});
  // Product safety stock always compares against ALL warehouses in the same unit, independently of location/LOT filters.
  var global=db.StockBalances.AsNoTracking().Where(x=>x.TenantId==tenant).GroupBy(x=>new{x.ProductId,x.Unit}).Select(g=>new{g.Key.ProductId,g.Key.Unit,Available=pg?g.Sum(x=>x.Quantity-x.ReservedQuantity):(decimal)Math.Round(g.Sum(x=>(double)(x.Quantity-x.ReservedQuantity)),3)});
  var requireStock=!byProduct||q.WarehouseId.HasValue||q.ZoneId.HasValue||q.RackId.HasValue||q.LocationId.HasValue||!string.IsNullOrWhiteSpace(q.Lot)||q.Trace;
  var rows=from p in Products(tenant,q)
    join g in grouped on p.Id equals g.ProductId into groups from g in groups.DefaultIfEmpty()
    join total in global on new{ProductId=p.Id,Unit=g.Unit??p.Unit} equals new{total.ProductId,total.Unit} into totals from total in totals.DefaultIfEmpty()
    join c in db.ProductCategories on new{p.TenantId,Id=p.CategoryId} equals new{c.TenantId,Id=(Guid?)c.Id} into categories from c in categories.DefaultIfEmpty()
    where !requireStock||g.Unit!=null
    select new StockOverviewRow{ProductId=p.Id,ProductCode=p.Code,ProductName=p.Name,CategoryId=p.CategoryId,CategoryName=c.Name,Barcode=p.Barcode,WarehouseId=g.WarehouseId,WarehouseName=g.WarehouseName,ZoneId=g.ZoneId,ZoneName=g.ZoneName,RackId=g.RackId,RackCode=g.RackCode,RackName=g.RackName,LocationId=g.LocationId,LocationCode=g.LocationCode,LocationName=g.LocationName,LotNumber=g.LotNumber,ExpiryDate=g.ExpiryDate,SerialNumber=g.SerialNumber,Unit=g.Unit??p.Unit,Quantity=(decimal?)g.Quantity??0,ReservedQuantity=(decimal?)g.Reserved??0,AvailableQuantity=((decimal?)g.Quantity??0)-((decimal?)g.Reserved??0),GlobalAvailableQuantity=(decimal?)total.Available??0,SafetyStock=p.SafetyStock,SafetyComparable=(g.Unit??p.Unit)==p.Unit,IsActive=p.IsActive,IsLow=(g.Unit??p.Unit)==p.Unit&&p.SafetyStock!=null&&((decimal?)total.Available??0)<p.SafetyStock,HasExpired=(bool?)g.Expired??false,HasExpiring=(bool?)g.Expiring??false};
  return q.Status switch{"normal"=>rows.Where(x=>x.Quantity>0&&!x.IsLow&&!x.HasExpired&&!x.HasExpiring),"low"=>rows.Where(x=>x.IsLow),"zero"=>rows.Where(x=>x.Quantity==0),"expired"=>rows.Where(x=>x.HasExpired),"expiring"=>rows.Where(x=>x.HasExpiring),"reserved"=>rows.Where(x=>x.ReservedQuantity>0),_=>rows};
 }
 static IOrderedQueryable<StockOverviewRow> Ordered(IQueryable<StockOverviewRow> rows)=>rows.OrderBy(x=>x.ProductCode).ThenBy(x=>x.ProductId).ThenBy(x=>x.Unit).ThenBy(x=>x.WarehouseId).ThenBy(x=>x.LocationId).ThenBy(x=>x.LotNumber).ThenBy(x=>x.ExpiryDate).ThenBy(x=>x.SerialNumber);
 // Apply hierarchy order before paging; retain product/detail/export ordering elsewhere.
 static IOrderedQueryable<StockOverviewRow> LocationOrdered(IQueryable<StockOverviewRow> rows)=>rows
  .OrderBy(x=>x.WarehouseName).ThenBy(x=>x.WarehouseId)
  .ThenBy(x=>x.ZoneName).ThenBy(x=>x.ZoneId)
  .ThenBy(x=>x.RackCode).ThenBy(x=>x.RackId)
  .ThenBy(x=>x.LocationCode).ThenBy(x=>x.LocationId)
  .ThenBy(x=>x.ProductCode).ThenBy(x=>x.ProductId).ThenBy(x=>x.Unit)
  .ThenBy(x=>x.LotNumber).ThenBy(x=>x.ExpiryDate).ThenBy(x=>x.SerialNumber);
 async Task<object> Summary(Guid tenant,StockOverviewQuery q,IQueryable<StockOverviewRow> rows,CancellationToken ct)=>new {
  registeredProducts=await Products(tenant,q).CountAsync(ct),matchingProducts=await rows.Select(x=>x.ProductId).Distinct().CountAsync(ct),
  holdingProducts=await rows.Where(x=>x.Quantity>0).Select(x=>x.ProductId).Distinct().CountAsync(ct),
  lowProducts=await rows.Where(x=>x.IsLow).Select(x=>x.ProductId).Distinct().CountAsync(ct),
  reservedProducts=await rows.Where(x=>x.ReservedQuantity>0).Select(x=>x.ProductId).Distinct().CountAsync(ct)};
 public async Task<object> List(Guid tenant,StockOverviewQuery q,CancellationToken ct)
 {
  await using var tx=await Snapshot(ct);var rows=Rows(tenant,q);var total=await rows.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(int)Math.Ceiling(total/(double)q.PageSize)));
  var summary=await Summary(tenant,q,rows,ct);var items=await (q.View=="location"?LocationOrdered(rows):Ordered(rows)).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);await tx.CommitAsync(ct);
  return new{items,total,page,pageSize=q.PageSize,summary,asOf,today=Today,expirySoonDays=options.ExpirySoonDays,timeZone=options.TimeZoneId,maxExportRows=options.MaxExportRows};
 }
 // Warehouse-first projection; existing product/location queries retain their contract.
 public async Task<object> WarehouseSummary(Guid tenant,StockOverviewQuery q,CancellationToken ct)
 {
  q.View="warehouse";Validate(q);await using var tx=await Snapshot(ct);var rows=Rows(tenant,q);
  var warehouses=rows.GroupBy(r=>new{r.WarehouseId,r.WarehouseName}).Select(g=>new{g.Key.WarehouseId,g.Key.WarehouseName,ProductCount=g.Select(r=>r.ProductId).Distinct().Count()});
  var total=await warehouses.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(int)Math.Ceiling(total/(double)q.PageSize)));
  var groups=await warehouses.OrderBy(w=>w.WarehouseName).ThenBy(w=>w.WarehouseId).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);
  var ids=groups.Select(w=>w.WarehouseId).ToArray();var pg=db.Database.IsNpgsql();
  // Never add historical kg/box quantities to EA or silently convert saved inventory.
  var quantities=await rows.Where(r=>ids.Contains(r.WarehouseId)).GroupBy(r=>new{r.WarehouseId,r.Unit}).Select(g=>new {
   g.Key.WarehouseId,g.Key.Unit,Quantity=pg?g.Sum(r=>r.Quantity):(decimal)Math.Round(g.Sum(r=>(double)r.Quantity),3),
   ReservedQuantity=pg?g.Sum(r=>r.ReservedQuantity):(decimal)Math.Round(g.Sum(r=>(double)r.ReservedQuantity),3),
   AvailableQuantity=pg?g.Sum(r=>r.AvailableQuantity):(decimal)Math.Round(g.Sum(r=>(double)r.AvailableQuantity),3)
  }).ToListAsync(ct);
  var items=groups.Select(w=>new{w.WarehouseId,w.WarehouseName,w.ProductCount,quantities=quantities.Where(x=>x.WarehouseId==w.WarehouseId).OrderBy(x=>x.Unit).Select(x=>new{x.Unit,x.Quantity,x.ReservedQuantity,x.AvailableQuantity})}).ToArray();
  var summary=await Summary(tenant,q,rows,ct);await tx.CommitAsync(ct);
  return new{items,total,page,pageSize=q.PageSize,summary,asOf,today=Today,expirySoonDays=options.ExpirySoonDays,timeZone=options.TimeZoneId,maxExportRows=options.MaxExportRows};
 }
 public async Task<object> GetSummary(Guid tenant,StockOverviewQuery q,CancellationToken ct){await using var tx=await Snapshot(ct);var result=await Summary(tenant,q,Rows(tenant,q),ct);await tx.CommitAsync(ct);return result;}
 public async Task<object> Detail(Guid tenant,Guid productId,StockOverviewQuery q,CancellationToken ct)
 {
  q.ProductId=productId;Validate(q);await using var tx=await Snapshot(ct);
  var product=await db.Products.AsNoTracking().Where(x=>x.TenantId==tenant&&x.Id==productId).Select(x=>new{x.Id,x.Code,x.Name,x.Barcode,x.CategoryId,x.Unit,x.SafetyStock,x.IsActive,x.LotManaged,x.ExpiryManaged,x.SerialManaged}).SingleOrDefaultAsync(ct)??throw Error("상품을 찾을 수 없습니다.",404);
  q.View="location";var rows=Rows(tenant,q);var total=await rows.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(int)Math.Ceiling(total/(double)q.PageSize)));var items=await Ordered(rows).Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);
  var cells=Cells(tenant,q);var history=from m in db.StockMovements.AsNoTracking() where m.TenantId==tenant&&cells.Any(x=>x.StockId==m.StockId)
    join s in db.StockBalances on new{m.TenantId,Id=m.StockId} equals new{s.TenantId,s.Id}
    join u in db.Users on m.ActorId equals u.Id
    join receipt in db.InboundReceipts on new{m.TenantId,Id=m.ReceiptId} equals new{receipt.TenantId,Id=(Guid?)receipt.Id} into receipts from receipt in receipts.DefaultIfEmpty()
    join shipment in db.OutboundShipments on new{m.TenantId,Id=m.ShipmentId} equals new{shipment.TenantId,Id=(Guid?)shipment.Id} into shipments from shipment in shipments.DefaultIfEmpty()
    join operation in db.InventoryOperations on new{m.TenantId,Id=m.OperationId} equals new{operation.TenantId,Id=(Guid?)operation.Id} into operations from operation in operations.DefaultIfEmpty()
    join count in db.Stocktakes on new{m.TenantId,Id=m.StocktakeId} equals new{count.TenantId,Id=(Guid?)count.Id} into counts from count in counts.DefaultIfEmpty()
    select new{m.Id,m.Type,m.Quantity,s.Unit,m.CreatedAt,actorName=u.DisplayName,number=receipt.Number??shipment.Number??operation.Number??count.Number,source=operation.SourceLabel,destination=operation.DestinationLabel};
  // SQLite QA maps DateTimeOffset to ISO text; production orders the timestamp directly.
  var ordered=db.Database.IsNpgsql()?history.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id):history.OrderByDescending(x=>x.CreatedAt.ToString()).ThenBy(x=>x.Id);
  var recentReceipts=await ordered.Where(x=>x.Type=="ReceiptConfirmed").Take(5).ToListAsync(ct);var recentShipments=await ordered.Where(x=>x.Type=="ShipmentConfirmed").Take(5).ToListAsync(ct);var recentChanges=await ordered.Where(x=>x.Type!="ReceiptConfirmed"&&x.Type!="ShipmentConfirmed").Take(10).ToListAsync(ct);
  await tx.CommitAsync(ct);return new{product,items,total,page,pageSize=q.PageSize,recentReceipts,recentShipments,recentChanges};
 }
 public async Task<object> Choices(Guid tenant,string kind,string? search,Guid? warehouseId,Guid? zoneId,Guid? rackId,int page,CancellationToken ct)
 {
  if(search?.Length>100||page<1||page>100000)throw Error("선택 목록 조건을 확인해 주세요.");var term=search?.Trim().ToLowerInvariant()??"";
  IQueryable<Choice> choices=kind switch{
   "categories"=>from c in db.ProductCategories where c.TenantId==tenant
       join p in db.ProductCategories on new{c.TenantId,Id=c.ParentId} equals new{p.TenantId,Id=(Guid?)p.Id} into parents from p in parents.DefaultIfEmpty()
       join g in db.ProductCategories on new{TenantId=c.TenantId,Id=p.ParentId} equals new{g.TenantId,Id=(Guid?)g.Id} into grandparents from g in grandparents.DefaultIfEmpty()
       select new Choice{Id=c.Id,Code="",Name=c.Name,CustomCode=g.Name!=null?g.Name+" › "+p.Name:p.Name},
   "warehouses"=>db.Warehouses.Where(x=>x.TenantId==tenant).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=x.CustomCode}),
   "zones"=>db.WarehouseZones.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=null}),
   "racks"=>db.WarehouseRacks.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&(!zoneId.HasValue||x.ZoneId==zoneId)).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=null}),
   "locations"=>db.StorageLocations.Where(x=>x.TenantId==tenant&&x.WarehouseId==warehouseId&&(!rackId.HasValue||x.RackId==rackId)&&(!zoneId.HasValue||x.ZoneId==zoneId||db.WarehouseRacks.Any(r=>r.TenantId==tenant&&r.WarehouseId==warehouseId&&r.Id==x.RackId&&r.ZoneId==zoneId))).Select(x=>new Choice{Id=x.Id,Code=x.Code,Name=x.Name,CustomCode=null}),_=>throw Error("선택 항목을 확인해 주세요.")};
  choices=choices.Where(x=>x.Code.ToLower().Contains(term)||x.Name.ToLower().Contains(term)||(x.CustomCode!=null&&x.CustomCode.ToLower().Contains(term)));return new{items=await choices.OrderBy(x=>x.Code).ThenBy(x=>x.Name).ThenBy(x=>x.Id).Skip((page-1)*30).Take(30).ToListAsync(ct),total=await choices.CountAsync(ct),page};
 }
 public sealed class Choice{public string? CustomCode{get;set;}public Guid Id{get;set;}public string Code{get;set;}="";public string Name{get;set;}="";}
 public async Task<(Stream stream,string contentType,string filename)> Export(Guid tenant,StockOverviewQuery q,string format,CancellationToken ct)
 {
  if(format is not ("csv" or "xlsx"))throw Error("CSV 또는 Excel 형식을 선택해 주세요.");await using var tx=await Snapshot(ct);var rows=Rows(tenant,q);var count=await rows.CountAsync(ct);if(count>options.MaxExportRows)throw Error($"한 번에 {options.MaxExportRows:N0}행까지 다운로드할 수 있습니다. 검색 조건을 좁혀 주세요.",413);
  var file=StockOverviewExport.CreateTemporaryStream();try{await StockOverviewExport.Write(file,Ordered(rows).AsAsyncEnumerable(),format,ct);await tx.CommitAsync(ct);file.Position=0;return(file,format=="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",$"stock-overview-{q.View}-{clock.GetUtcNow():yyyyMMddHHmmss}.{format}");}catch{await file.DisposeAsync();throw;}
 }
}
