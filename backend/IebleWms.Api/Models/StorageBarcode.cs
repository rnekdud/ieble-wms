namespace IebleWms.Api.Models;

// One namespace for rack and future location labels; identity belongs to storage, never a plan object.
public sealed class StorageBarcode
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? ProductId { get; set; }
    public Guid? WarehouseId { get; set; }
    public Guid? RackId { get; set; }
    public Guid? LocationId { get; set; }
    public string PackageCode { get; set; } = "EA";
    public bool IsPrimary { get; set; }
    public string? Description { get; set; }
    public string BarcodeType { get; set; } = "Internal";
    public DateTimeOffset? CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public string Value { get; set; } = "";
    public bool IsGenerated { get; set; }
}
