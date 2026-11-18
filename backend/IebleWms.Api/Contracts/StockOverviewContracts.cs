using System.ComponentModel.DataAnnotations;
namespace IebleWms.Api.Contracts;
public sealed class StockOverviewQuery
{
 public string View {get;set;}="product";
 [StringLength(100)] public string? Search {get;set;}
 [StringLength(100)] public string? Lot {get;set;}
 public Guid? ProductId {get;set;} public Guid? CategoryId {get;set;}
 public Guid? WarehouseId {get;set;} public Guid? ZoneId {get;set;} public Guid? RackId {get;set;} public Guid? LocationId {get;set;}
 public string Status {get;set;}="all"; public string Active {get;set;}="all";
 public int Page {get;set;}=1; public int PageSize {get;set;}=20;
 public bool Trace {get;set;} public string? LotExact {get;set;} public DateOnly? ExpiryExact {get;set;} public string? SerialExact {get;set;} public string? Unit {get;set;}
}
public sealed class StockOverviewRow
{
 public Guid ProductId {get;set;} public string ProductCode {get;set;}=""; public string ProductName {get;set;}="";
 public Guid? CategoryId {get;set;} public string? CategoryName {get;set;} public string? Barcode {get;set;}
 public Guid? WarehouseId {get;set;} public string? WarehouseName {get;set;}
 public Guid? ZoneId {get;set;} public string? ZoneName {get;set;} public Guid? RackId {get;set;} public string? RackCode {get;set;} public string? RackName {get;set;}
 public Guid? LocationId {get;set;} public string? LocationCode {get;set;} public string? LocationName {get;set;}
 public string? LotNumber {get;set;} public DateOnly? ExpiryDate {get;set;} public string? SerialNumber {get;set;}
 public string Unit {get;set;}=""; public decimal Quantity {get;set;} public decimal ReservedQuantity {get;set;} public decimal AvailableQuantity {get;set;}
 public decimal GlobalAvailableQuantity {get;set;} public decimal? SafetyStock {get;set;} public bool SafetyComparable {get;set;}
 public bool IsActive {get;set;} public bool IsLow {get;set;} public bool HasExpired {get;set;} public bool HasExpiring {get;set;}
 public string[] Statuses=>StockOverviewStatus.Labels(Quantity,IsLow,HasExpired,HasExpiring);
}
public static class StockOverviewStatus
{
 public static string[] Labels(decimal quantity,bool low,bool expired,bool expiring)
 {
  var result=new List<string>();if(quantity==0)result.Add("재고 없음");if(low)result.Add("안전재고 부족");if(expired)result.Add("유통기한 경과");if(expiring)result.Add("유통기한 임박");if(result.Count==0)result.Add("정상");return result.ToArray();
 }
}
