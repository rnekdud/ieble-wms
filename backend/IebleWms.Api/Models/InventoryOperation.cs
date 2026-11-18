using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;
public sealed class InventoryOperation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Number { get; set; } = "";
    public string Type { get; set; } = "";
    public Guid ProductId { get; set; }
    public string ProductCode { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string Unit { get; set; } = "";
    public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public string? SerialNumber { get; set; }
    public Guid? SourceStockId { get; set; }
    public Guid? DestinationStockId { get; set; }
    public Guid? SourceWarehouseId { get; set; }
    public Guid? SourceLocationId { get; set; }
    public Guid? DestinationWarehouseId { get; set; }
    public Guid? DestinationLocationId { get; set; }
    public string? SourceLabel { get; set; }
    public string? DestinationLabel { get; set; }
    public decimal Quantity { get; set; }
    public decimal BeforeSource { get; set; }
    public decimal AfterSource { get; set; }
    public decimal BeforeDestination { get; set; }
    public decimal AfterDestination { get; set; }
    public string Reason { get; set; } = "";
    public string? Notes { get; set; }
    public Guid? ContactUserId { get; set; }
    public string? ContactName { get; set; }
    public Guid ActorId { get; set; }
    public string ActorName { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    [JsonIgnore] public Guid RequestId { get; set; }
    [JsonIgnore] public string RequestHash { get; set; } = "";
}
public sealed class InventoryChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid OperationId { get; set; }
    public Guid ActorId { get; set; }
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
