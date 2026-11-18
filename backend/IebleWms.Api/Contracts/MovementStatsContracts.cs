namespace IebleWms.Api.Contracts;
public sealed class MovementStatsQuery
{
 public DateOnly? Start {get;set;} public DateOnly? End {get;set;}
 public string View {get;set;}="product"; public string Bucket {get;set;}="auto"; public string Direction {get;set;}="all";
 public string? Search {get;set;} public Guid? ProductId {get;set;} public Guid? CategoryId {get;set;} public Guid? WarehouseId {get;set;} public Guid? PartnerId {get;set;}
 public Guid? DocumentId {get;set;} public string? Unit {get;set;}
 public int Page {get;set;}=1;public int PageSize {get;set;}=20;
}
public sealed class MovementFact
{
 public Guid RowId {get;set;} public Guid DocumentId {get;set;} public string Number {get;set;}="";public string Direction {get;set;}="";
 public string ConfirmedAt {get;set;}="";public string Day {get;set;}="";public string ActorName {get;set;}="";
 public Guid ProductId {get;set;} public string ProductCode {get;set;}="";public string ProductName {get;set;}="";public Guid? CategoryId {get;set;} public string? CategoryName {get;set;}
 public Guid WarehouseId {get;set;}public string WarehouseCode {get;set;}="";public string WarehouseName {get;set;}="";
 public Guid PartnerId {get;set;}public string PartnerCode {get;set;}="";public string PartnerName {get;set;}="";public string PartnerType {get;set;}="";
 public string Unit {get;set;}="";public decimal Quantity {get;set;}public string? LotNumber {get;set;}public DateOnly? ExpiryDate {get;set;}public string? SerialNumber {get;set;}
}
public sealed class MovementStatsRow
{
 public Guid Id {get;set;} public string Code {get;set;}="";public string Name {get;set;}="";public string? CategoryName {get;set;}public string? PartnerType {get;set;}public string? Unit {get;set;}
 public int Receipts {get;set;}public int Shipments {get;set;}public int ReceiptProducts {get;set;}public int ShipmentProducts {get;set;}
 public decimal ReceiptQuantity {get;set;}public decimal ShipmentQuantity {get;set;}public decimal Difference=>ReceiptQuantity-ShipmentQuantity;public string? LastProcessedAt {get;set;}
}
public sealed record MovementTrend(string Start,string End,int Receipts,int Shipments);
