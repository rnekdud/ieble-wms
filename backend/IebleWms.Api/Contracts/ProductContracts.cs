using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ProductRequest
{
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    [StringLength(64)] public string Code { get; set; } = "";
    [Required,StringLength(200)] public string Name { get; set; } = "";
    public int? InnerPackQuantity { get; set; }
    public int? OuterPackQuantity { get; set; }
    public string OuterPackUnit { get; set; } = "INNER";
    public int? PalletPackQuantity { get; set; }
    public string? ModelNumber { get; set; }
    public string? Origin { get; set; }
    public Guid? ProductTypeId { get; set; }
    public decimal? CostPrice { get; set; }
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
    public ProductBarcodeRequest[]? Barcodes { get; set; }
    public ProductImageRequest? Image { get; set; }
    [MaxLength(8)] public ProductGalleryImageRequest[]? Images { get; set; }
    public Guid? CategoryId { get; set; }
    [Required,StringLength(16)] public string Unit { get; set; } = "EA";
    public RackBarcodeChange? Barcode { get; set; }
    [Required,RegularExpression("^(Internal|External)$")] public string BarcodeType { get; set; } = "Internal";
    public bool LotManaged { get; set; }
    public bool ExpiryManaged { get; set; }
    public bool SerialManaged { get; set; }
    [Range(typeof(decimal),"0","999999999.999")] public decimal? SafetyStock { get; set; }
    public bool IsActive { get; set; } = true;
    [StringLength(2000)] public string? Notes { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ProductCategoryRequest {
    [Required,StringLength(100)] public string Name { get; set; } = "";
    public Guid? ParentId { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid Version { get; set; }
}
public sealed class ProductBarcodeRequest {
    public string PackageCode { get; set; } = "EA";
    public Guid? Id { get; set; }
    public RackBarcodeChange Change { get; set; } = new();
    public bool IsPrimary { get; set; }
    [StringLength(200)] public string? Description { get; set; }
    public string BarcodeType { get; set; } = "Internal";
}
public sealed class ProductGalleryImageRequest {
    public Guid? Id { get; set; }
    public bool IsPrimary { get; set; }
    [StringLength(160)] public string? FileName { get; set; }
    [StringLength(64)] public string? ContentType { get; set; }
    [StringLength(2800000)] public string? Base64 { get; set; }
}
public sealed class ProductImageRequest {
    public bool Remove { get; set; }
    [StringLength(160)] public string? FileName { get; set; }
    [StringLength(2800000)] public string? Base64 { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ProductStatusRequest { public Guid Version { get; set; } public bool IsActive { get; set; } }
