namespace IebleWms.Api.Contracts;
public sealed class StocktakeRequest
{
 public Guid RequestId {get;set;} public string Name {get;set;}=""; public Guid WarehouseId {get;set;}
 public string Scope {get;set;}="Warehouse"; public Guid? ScopeId {get;set;} public DateTimeOffset BasisAt {get;set;}
 [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? ContactUserId { get; set; }
    public string ContactName {get;set;}=""; public string? Notes {get;set;}
 [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
 public StocktakeSelectionInput[]? Selection {get;set;}
}
public class StocktakeAction { public Guid Version {get;set;} }
public sealed class StocktakeCountRequest : StocktakeAction { public StocktakeCount[] Items {get;set;}=[]; }
public sealed class StocktakeCount { public Guid TargetId {get;set;} public decimal? Quantity {get;set;} public string? ObservedSerial {get;set;} public string? Reason {get;set;} }
public sealed class StocktakeFoundRequest : StocktakeAction
{
 public Guid RequestId {get;set;} public Guid ProductId {get;set;} public Guid LocationId {get;set;} public decimal Quantity {get;set;}
 public string? LotNumber {get;set;} public DateOnly? ExpiryDate {get;set;} public string? SerialNumber {get;set;} public string? Reason {get;set;}
}
public sealed class StocktakeSelectionInput
{
 public Guid? StockId {get;set;} public Guid? StockVersion {get;set;}
 public Guid ProductId {get;set;} public Guid LocationId {get;set;}
 public string? LotNumber {get;set;} public DateOnly? ExpiryDate {get;set;} public string? SerialNumber {get;set;}
 public decimal? Quantity {get;set;} public string? ObservedSerial {get;set;} public string? Reason {get;set;}
}
public sealed class StocktakeSelectionRequest : StocktakeAction
{
 public StocktakeSelectionInput[] Add {get;set;}=[]; public Guid[] Remove {get;set;}=[];
}

public sealed class StocktakeDraftRequest : StocktakeAction
{
 public DateTimeOffset BasisAt {get;set;}
 [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? ContactUserId { get; set; }
    public string ContactName {get;set;}="";
 public string? Notes {get;set;}
 public StocktakeDraftItem[] Items {get;set;}=[];
}
public sealed class StocktakeDraftItem
{
 public Guid? TargetId {get;set;}
 public StocktakeSelectionInput Selection {get;set;}=new();
}
