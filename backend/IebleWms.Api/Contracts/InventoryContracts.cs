using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class InventoryRequest
{
    [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? ContactUserId { get; set; }
    public Guid RequestId { get; set; }
    public Guid? StockId { get; set; }
    public Guid Version { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? WarehouseId { get; set; }
    public Guid? LocationId { get; set; }
    [StringLength(100)] public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [StringLength(100)] public string? SerialNumber { get; set; }
    public decimal Quantity { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    [Required,StringLength(300)] public string Reason { get; set; } = "";
    [StringLength(2000)] public string? Notes { get; set; }
    // Adjustment only; move uses the dedicated endpoint.
    public bool Increase { get; set; }
}
public sealed class InventoryQuery
{
    [StringLength(100)] public string? Search { get; set; }
    [StringLength(100)] public string? Lot { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? WarehouseId { get; set; }
    public Guid? RackId { get; set; }
    public Guid? LocationId { get; set; }
    public string Status { get; set; } = "all";
    public string Active { get; set; } = "all";
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
public sealed class InventoryRow
{
    public Guid Id { get; set; }
    public Guid Version { get; set; }
    public Guid ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string? Barcode { get; set; }
    public Guid WarehouseId { get; set; }
    public string WarehouseName { get; set; } = "";
    public Guid? RackId { get; set; }
    public string? RackCode { get; set; }
    public Guid LocationId { get; set; }
    public string LocationCode { get; set; } = "";
    public string Unit { get; set; } = "";
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? SerialNumber { get; set; }
    public bool IsActive { get; set; }
    public bool SerialManaged { get; set; }
    public decimal Quantity { get; set; }
    public decimal ReservedQuantity { get; set; }
    public decimal AvailableQuantity { get; set; }
}
