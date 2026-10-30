namespace IebleWms.Api.Models;

// Presentation only: moving a plan object never mutates physical warehouse identities.
public sealed class WarehousePlan : AuditableEntity
{
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public int SchemaVersion { get; set; } = 1;
    public double AspectRatio { get; set; } = 1.5;
}
public sealed class WarehousePlanObject
{
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid Id { get; set; }
    public string Type { get; set; } = "shape";
    public string Label { get; set; } = "";
    // Center and dimensions relative to the document bounds, independent of viewport pixels.
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public double Rotation { get; set; }
    public string Fill { get; set; } = "#dfece7";
    public string Shape { get; set; } = "rectangle";
    public int SortOrder { get; set; }
    public Guid? RackId { get; set; }
    public Guid? ZoneId { get; set; }
    public Guid? LocationId { get; set; }
}
