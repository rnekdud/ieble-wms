namespace IebleWms.Api.Contracts;
public sealed class StockHistoryQuery
{
 public DateOnly? Start{get;set;}public DateOnly? End{get;set;}public string Type{get;set;}="all";
 public string? Search{get;set;}public string? Lot{get;set;}public string? Serial{get;set;}public string? Document{get;set;}
 public Guid? WarehouseId{get;set;}public Guid? RackId{get;set;}public Guid? LocationId{get;set;}public Guid? ActorId{get;set;}
 public int Page{get;set;}=1;public int PageSize{get;set;}=20;
}
public sealed class StockHistoryRow
{
 public Guid Id{get;set;}public Guid StockId{get;set;}public string Type{get;set;}="";public string CreatedAt{get;set;}="";public decimal Quantity{get;set;}
 public string? Unit{get;set;}public Guid? ProductId{get;set;}public string? ProductCode{get;set;}public string? ProductName{get;set;}public string? Barcode{get;set;}
 public Guid? WarehouseId{get;set;}public string? WarehouseName{get;set;}public Guid? RackId{get;set;}public string? RackCode{get;set;}public Guid? LocationId{get;set;}public string? LocationCode{get;set;}public string? LocationSnapshot{get;set;}
 public string? LotNumber{get;set;}public DateOnly? ExpiryDate{get;set;}public string? SerialNumber{get;set;}
 public Guid ActorId{get;set;}public string? ActorName{get;set;}public string? Reason{get;set;}
 public string DocumentKind{get;set;}="";public Guid? DocumentId{get;set;}public string? DocumentNumber{get;set;}public bool DocumentLinked{get;set;}
}
public static class StockHistoryTypes
{
 public static readonly string[] Codes=["ReceiptConfirmed","ShipmentConfirmed","MoveIn","MoveOut","AdjustmentIncrease","AdjustmentDecrease","StocktakeIncrease","StocktakeDecrease"];
 public static string Label(string type)=>type switch{"ReceiptConfirmed"=>"입고","ShipmentConfirmed"=>"출고","MoveIn"=>"재고 이동 · 도착","MoveOut"=>"재고 이동 · 출발","AdjustmentIncrease"=>"재고 증가 조정","AdjustmentDecrease"=>"재고 감소 조정","StocktakeIncrease"=>"재고 실사/조사 · 증가","StocktakeDecrease"=>"재고 실사/조사 · 감소",_=>type};
}
