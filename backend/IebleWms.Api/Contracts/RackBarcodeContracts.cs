using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class RackBarcodeChange
{
    [Required, RegularExpression("^(keep|auto|manual|none)$")] public string Mode { get; set; } = "keep";
    [StringLength(64)] public string? Value { get; set; }
    [StringLength(1024), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Proof { get; set; }
}
public sealed record RackBarcodeCandidate(string Value, string Proof);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateRackBarcodeRequest
{
    public Guid Version { get; set; }
    [Required] public RackBarcodeChange Barcode { get; set; } = new();
}
