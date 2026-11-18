using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using IebleWms.Api.Models;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptRequest
{
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    public DateOnly ExpectedDate { get; set; }
    public Guid PartnerId { get; set; }
    public Guid WarehouseId { get; set; }
    [System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    public Guid? ContactUserId { get; set; }
    [StringLength(200)] public string ContactName { get; set; } = "";
    [StringLength(2000)] public string? Notes { get; set; }
    [Required,MinLength(1)] public ReceiptLineRequest[] Lines { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptLineRequest
{
    [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingNull)] public Guid? LineId { get; set; }
    [MaxLength(100),JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingNull)] public ReceiptTrackingAllocation[]? TrackingAllocations { get; set; }
    public Guid ProductId { get; set; }
    [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingNull)]
    public Guid? PlannedRackId { get; set; }
    public decimal ExpectedQuantity { get; set; }
    [StringLength(100)] public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [MaxLength(1000)] public string[] Serials { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptVersionRequest { public Guid Version { get; set; } }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptInspectionRequest
{
    [StringLength(500)] public string? Reason { get; set; }
    public Guid Version { get; set; }
    [Required,MinLength(1)] public InspectionLine[] Lines { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class InspectionLine
{
    public Guid LineId { get; set; }
    public decimal Quantity { get; set; }
    [StringLength(100)] public string? LotNumber { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    [MaxLength(1000)] public string[] Serials { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptPlacementRequest
{
    public Guid Version { get; set; }
    [Required,MinLength(1)] public PlacementLine[] Lines { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PlacementLine
{
    public Guid LineId { get; set; }
    [Required,MaxLength(100)] public ReceiptPlacement[] Placements { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptScanRequest
{
    [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingDefault)] public bool GroupByProduct { get; set; }
    public Guid RequestId { get; set; }
    [Required,StringLength(64,MinimumLength=1)] public string Barcode { get; set; } = "";
    public Guid? LineId { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptQuantityRequest
{
    [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingDefault)] public bool GroupByProduct { get; set; }
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    public Guid LineId { get; set; }
    public decimal? Quantity { get; set; }
    public Guid? UndoScanRequestId { get; set; }
    [Required,StringLength(500)] public string Reason { get; set; } = "";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptTrackingRequest
{
    public Guid Version { get; set; }
    public Guid ProductId { get; set; }
    [Required,MinLength(1)] public ReceiptTrackingLine[] Lines { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptTrackingLine
{
    public Guid LineId { get; set; }
    [Required,MaxLength(100)] public ReceiptTrackingAllocation[] Allocations { get; set; } = [];
}
