using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;

public sealed class Product : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    [JsonIgnore] public string NormalizedCode { get; set; } = "";
    public string Name { get; set; } = "";
    public Guid? CategoryId { get; set; }
    public int? InnerPackQuantity { get; set; }
    public int? OuterPackQuantity { get; set; }
    public string OuterPackUnit { get; set; } = "INNER";
    public int? PalletPackQuantity { get; set; }
    public string? ModelNumber { get; set; }
    public string? Origin { get; set; }
    public Guid? ProductTypeId { get; set; }
    [JsonIgnore] public decimal? CostPrice { get; set; }
    public decimal? RetailPrice { get; set; }
    public string Currency { get; set; } = "KRW";
    public decimal? WeightGrams { get; set; }
    public decimal? WidthCm { get; set; }
    public decimal? DepthCm { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? BoxWeightGrams { get; set; }
    public decimal? BoxWidthCm { get; set; }
    public decimal? BoxDepthCm { get; set; }
    public decimal? BoxHeightCm { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped, JsonPropertyName("costPrice")]
    public decimal? AuthorizedCostPrice { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public List<StorageBarcode> Barcodes { get; set; } = [];
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public List<ProductImageInfo> Images { get; set; } = [];
    public bool HasImage { get; set; }
    public string Unit { get; set; } = "EA";
    public string? Barcode { get; set; }
    public string BarcodeType { get; set; } = "Internal";
    public bool BarcodeIsGenerated { get; set; }
    public bool LotManaged { get; set; }
    public bool ExpiryManaged { get; set; }
    public bool SerialManaged { get; set; }
    public decimal? SafetyStock { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    // Server-owned, monotonic: future stock/receipt/shipment writes must lock this in their own transaction.
    public DateTimeOffset? TrackingLockedAt { get; set; }
    [JsonIgnore] public Guid CreationRequestId { get; set; }
    [JsonIgnore] public string CreationHash { get; set; } = "";
}
public sealed class ProductCategory : AuditableEntity
{
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public bool IsSystem => Products.DefaultProductClassification.IsCategory(TenantId, Id);
    public Guid? ParentId { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    [JsonIgnore] public string NormalizedName { get; set; } = "";
}
public sealed class ProductChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid TargetId { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}

public sealed class ProductType : AuditableEntity
{
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public bool IsSystem => Products.DefaultProductClassification.IsType(TenantId, Id);
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    [JsonIgnore] public string NormalizedName { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
public sealed record ProductImageInfo(Guid Id, string FileName, string ContentType, bool IsPrimary, int Position, DateTimeOffset? CreatedAt);
public sealed class ProductImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public bool IsPrimary { get; set; }
    public int Position { get; set; }
    public DateTimeOffset? CreatedAt { get; set; }
    public Guid ProductId { get; set; }
    public Guid TenantId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Content { get; set; } = [];
}
