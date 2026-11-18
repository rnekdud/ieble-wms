using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;
public sealed class Stocktake : AuditableEntity
{
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid TenantId {get;set;}
 public string Number {get;set;}=""; public string Name {get;set;}="";
 public Guid WarehouseId {get;set;} public string WarehouseName {get;set;}="";
 public string Scope {get;set;}="Warehouse"; public Guid? ScopeId {get;set;} public string ScopeLabel {get;set;}="";
 public DateTimeOffset BasisAt {get;set;} public DateOnly BasisDate {get;set;}
 public DateTimeOffset SnapshotAt {get;set;} public DateTimeOffset? StartedAt {get;set;}
 public Guid? ContactUserId { get; set; }
    public string ContactName {get;set;}=""; public string? Notes {get;set;}
 public string Status {get;set;}="Prepared"; public Guid? ConfirmedBy {get;set;} public DateTimeOffset? ConfirmedAt {get;set;}
 [JsonIgnore] public Guid RequestId {get;set;} [JsonIgnore] public string RequestHash {get;set;}="";
}
public sealed class StocktakeTarget
{
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid TenantId {get;set;} public Guid StocktakeId {get;set;}
 public Guid? StockId {get;set;} public Guid ProductId {get;set;} public Guid WarehouseId {get;set;} public Guid LocationId {get;set;}
 public string ProductCode {get;set;}=""; public string ProductName {get;set;}=""; public string Unit {get;set;}="";
 public string LocationCode {get;set;}=""; public string RackCode {get;set;}="";
 public string? LotNumber {get;set;} public DateOnly? ExpiryDate {get;set;} public string? SerialNumber {get;set;}
 public decimal OriginalQuantity {get;set;} public decimal OriginalReserved {get;set;} public DateTimeOffset OriginalSnapshotAt {get;set;}
 public decimal BaselineQuantity {get;set;} public decimal BaselineReserved {get;set;} public Guid BaselineVersion {get;set;} public DateTimeOffset BaselineAt {get;set;}
 public decimal? CountedQuantity {get;set;} public string? ObservedSerial {get;set;} public string? Reason {get;set;}
 public Guid? CountedBy {get;set;} public DateTimeOffset? CountedAt {get;set;}
 public bool IsUnregistered {get;set;} public bool Excluded {get;set;}
}
public sealed class StocktakeChange
{
 public long Id {get;set;} public Guid TenantId {get;set;} public Guid StocktakeId {get;set;} public Guid? TargetId {get;set;}
 public Guid ActorId {get;set;} public string ActorName {get;set;}=""; public DateTimeOffset CreatedAt {get;set;}
 public string Action {get;set;}=""; public string BeforeJson {get;set;}="{}"; public string AfterJson {get;set;}="{}";
}
