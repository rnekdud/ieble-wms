using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;
public sealed class OutboundShipment : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Number { get; set; } = "";
    public DateOnly RequestDate { get; set; }
    public DateOnly ExpectedDate { get; set; }
    public Guid PartnerId { get; set; }
    public Guid WarehouseId { get; set; }
    public string PartnerName { get; set; } = "";
    public string WarehouseName { get; set; } = "";
    public Guid? ContactUserId { get; set; }
    public string ContactName { get; set; } = "";
    public string? Notes { get; set; }
    public string Status { get; set; } = "Requested";
    public Guid? PickedByUserId { get; set; }
    public DateTimeOffset? PickedAt { get; set; }
    public Guid? InspectedByUserId { get; set; }
    public DateTimeOffset? InspectedAt { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    [JsonIgnore] public Guid RequestId { get; set; }
    [JsonIgnore] public string RequestHash { get; set; } = "";
}
public sealed class OutboundShipmentLine
{
    [System.Text.Json.Serialization.JsonIgnore] public string? BarcodeSnapshotJson { get; set; }
    public Guid? PlannedRackId { get; set; }
    [JsonIgnore] public Guid? PlannedRackWarehouseId { get; set; }
    [NotMapped] public string? PlannedRackName { get; set; }
    [NotMapped] public string? PlannedRackCode { get; set; }
    [NotMapped] public decimal? RetailPrice { get; set; }
    [NotMapped] public string? Currency { get; set; }

    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ShipmentId { get; set; }
    public Guid ProductId { get; set; }
    public int Position { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string Unit { get; set; } = "EA";
    public bool LotManaged { get; set; }
    public bool ExpiryManaged { get; set; }
    public bool SerialManaged { get; set; }
    public decimal RequestedQuantity { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [JsonIgnore] public string SerialsJson { get; set; } = "[]";
    [NotMapped] public string[] Serials { get => JsonSerializer.Deserialize<string[]>(SerialsJson)!; set => SerialsJson = JsonSerializer.Serialize(value); }
}
public sealed class ShipmentAllocation
{
    [JsonIgnore] public Guid? SourceWarehouseId { get; set; }
    [JsonIgnore] public Guid? SourceLocationId { get; set; }
    [JsonIgnore] public Guid? SourceRackId { get; set; }
    [NotMapped] public Guid? LocationId { get; set; }
    [NotMapped] public Guid? RackId { get; set; }
    [NotMapped] public Guid WarehouseId { get; set; }
    [NotMapped] public string WarehouseName { get; set; } = "";
    [NotMapped] public string? PickedByName { get; set; }
    [NotMapped] public decimal ConfirmedQuantity => State == "Consumed" ? Quantity : 0;

    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid LineId { get; set; }
    public Guid StockId { get; set; }
    public string LocationCode { get; set; } = "";
    public string? RackCode { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? SerialNumber { get; set; }
    public decimal Quantity { get; set; }
    public decimal PickedQuantity { get; set; }
    public decimal InspectedQuantity { get; set; }
    public string State { get; set; } = "Active";
    public Guid? PickedByUserId { get; set; }
    public DateTimeOffset? PickedAt { get; set; }
    public Guid? InspectedByUserId { get; set; }
    public DateTimeOffset? InspectedAt { get; set; }
}
public sealed class ShipmentChange
{
    public Guid? ScanRequestId { get; set; }
    [JsonIgnore] public string? ScanRequestHash { get; set; }
    public Guid? AllocationId { get; set; }
    public string? Barcode { get; set; }
    public decimal? PreviousQuantity { get; set; }
    public decimal? Quantity { get; set; }
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ShipmentId { get; set; }
    public Guid ActorId { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
