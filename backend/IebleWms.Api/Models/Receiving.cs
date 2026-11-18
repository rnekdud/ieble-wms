using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;
public sealed class InboundReceipt : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Number { get; set; } = "";
    public DateOnly ExpectedDate { get; set; }
    public Guid PartnerId { get; set; }
    public Guid WarehouseId { get; set; }
    public string PartnerName { get; set; } = "";
    public string WarehouseName { get; set; } = "";
    public Guid? ContactUserId { get; set; }
    public string ContactName { get; set; } = "";
    public string? Notes { get; set; }
    public string Status { get; set; } = "Planned";
    public Guid? InspectedByUserId { get; set; }
    public DateTimeOffset? InspectedAt { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    [JsonIgnore] public Guid RequestId { get; set; }
    [JsonIgnore] public string RequestHash { get; set; } = "";
}
public sealed class ReceiptTrackingAllocation
{
    public Guid Id { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public decimal Quantity { get; set; }
    public string[] Serials { get; set; } = [];
}
public sealed class ReceiptPlacement
{
    public Guid? TrackingId { get; set; }
    public string? LocationCode { get; set; }
    public Guid LocationId { get; set; }
    public decimal Quantity { get; set; }
    public string[] Serials { get; set; } = [];
}
public sealed class InboundReceiptLine
{
    [System.Text.Json.Serialization.JsonIgnore] public string? BarcodeSnapshotJson { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public Guid ProductId { get; set; }
    public Guid? PlannedRackId { get; set; }
    [JsonIgnore] public Guid? PlannedRackWarehouseId { get; set; }
    [NotMapped] public string? PlannedRackName { get; set; }
    [NotMapped] public string? PlannedRackCode { get; set; }
    [NotMapped] public decimal? RetailPrice { get; set; }
    [NotMapped] public string? Currency { get; set; }
    public int Position { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string Unit { get; set; } = "EA";
    public bool LotManaged { get; set; }
    public bool ExpiryManaged { get; set; }
    public bool SerialManaged { get; set; }
    public decimal ExpectedQuantity { get; set; }
    public decimal? InspectedQuantity { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [JsonIgnore] public string SerialsJson { get; set; } = "[]";
    [JsonIgnore] public string? TrackingJson { get; set; }
    [NotMapped] public ReceiptTrackingAllocation[]? TrackingAllocations { get => TrackingJson == null ? null : JsonSerializer.Deserialize<ReceiptTrackingAllocation[]>(TrackingJson); set => TrackingJson = value == null ? null : JsonSerializer.Serialize(value); }
    [JsonIgnore] public string PlacementsJson { get; set; } = "[]";
    [NotMapped] public string[] Serials { get => JsonSerializer.Deserialize<string[]>(SerialsJson)!; set => SerialsJson = JsonSerializer.Serialize(value); }
    [NotMapped] public ReceiptPlacement[] Placements { get => JsonSerializer.Deserialize<ReceiptPlacement[]>(PlacementsJson)!; set => PlacementsJson = JsonSerializer.Serialize(value); }
}
public sealed class StockBalance : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid LocationId { get; set; }
    public Guid ProductId { get; set; }
    public Guid? ReceiptLineId { get; set; }
    public string SourceKey { get; set; } = "";
    public string Unit { get; set; } = "EA";
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? SerialNumber { get; set; }
    public decimal Quantity { get; set; }
    public decimal ReservedQuantity { get; set; }
}
public sealed class StockMovement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid StockId { get; set; }
    public Guid? ReceiptId { get; set; }
    public Guid? ShipmentId { get; set; }
    public Guid? OperationId { get; set; }
    public Guid? StocktakeId { get; set; }
    public string Type { get; set; } = "ReceiptConfirmed";
    public decimal Quantity { get; set; }
    public Guid ActorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class ReceiptChange
{
    public Guid? ScanRequestId { get; set; }
    [JsonIgnore] public string? ScanRequestHash { get; set; }
    public Guid? LineId { get; set; }
    public string? Barcode { get; set; }
    public decimal? PreviousQuantity { get; set; }
    public decimal? Quantity { get; set; }
    public string? Reason { get; set; }
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public Guid ActorId { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
