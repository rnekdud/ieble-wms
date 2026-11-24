using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptPhotoRequest
{
    public Guid? Id { get; set; }
    [StringLength(160)] public string? FileName { get; set; }
    [StringLength(40)] public string? ContentType { get; set; }
    [StringLength(6990508)] public string? Base64 { get; set; }
    [StringLength(349528)] public string? ThumbnailBase64 { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ReceiptPhotosRequest
{
    public Guid Version { get; set; }
    [Required,StringLength(64)] public string PhotosVersion { get; set; } = "";
    [Required,MaxLength(10)] public ReceiptPhotoRequest[] Photos { get; set; } = [];
}
