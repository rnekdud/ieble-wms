using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PlanObjectDto
{
    public Guid Id { get; set; }
    [Required] public string Type { get; set; } = "shape";
    [Required(AllowEmptyStrings = true), StringLength(200)] public string Label { get; set; } = "";
    [Range(0d, 1d)] public double X { get; set; }
    [Range(0d, 1d)] public double Y { get; set; }
    [Range(.005, 1)] public double Width { get; set; }
    [Range(.005, 1)] public double Height { get; set; }
    [Range(-180d, 180d)] public double Rotation { get; set; }
    [Required, RegularExpression("^#[0-9a-fA-F]{6}$")] public string Fill { get; set; } = "#dfece7";
    [Required, RegularExpression("^(rectangle|ellipse)$")] public string Shape { get; set; } = "rectangle";
    public Guid? RackId { get; set; }
    public Guid? ZoneId { get; set; }
    public Guid? LocationId { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SaveWarehousePlanRequest
{
    public Guid Version { get; set; }
    [Range(1, 1)] public int SchemaVersion { get; set; } = 1;
    [Range(.25, 4)] public double AspectRatio { get; set; } = 1.5;
    [Required, MaxLength(500)] public List<PlanObjectDto> Objects { get; set; } = [];
}
