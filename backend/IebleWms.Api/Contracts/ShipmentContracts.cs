using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using IebleWms.Api.Models;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentRequest
{
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    public DateOnly RequestDate { get; set; }
    public DateOnly ExpectedDate { get; set; }
    public Guid PartnerId { get; set; }
    public Guid WarehouseId { get; set; }
    [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? ContactUserId { get; set; }
    [StringLength(200)] public string ContactName { get; set; } = "";
    [StringLength(2000)] public string? Notes { get; set; }
    [Required,MinLength(1)] public ShipmentLineRequest[] Lines { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentLineRequest
{
    [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingNull)]
    public Guid? PlannedRackId { get; set; }

    public Guid ProductId { get; set; }
    public decimal RequestedQuantity { get; set; }
    [StringLength(100)] public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [MaxLength(1000)] public string[] Serials { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentVersionRequest { public Guid Version { get; set; } }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentWorkRequest
{
    public Guid Version { get; set; }
    public bool Complete { get; set; }
    [Required,MinLength(1),MaxLength(10000)] public ShipmentWorkLine[] Allocations { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentWorkLine
{
    public Guid AllocationId { get; set; }
    public decimal Quantity { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ShipmentScanRequest
{
    public Guid RequestId { get; set; }
    [Required,StringLength(64,MinimumLength=1)] public string Barcode { get; set; } = "";
    public Guid? AllocationId { get; set; }
    public Guid? LocationId { get; set; }
}
