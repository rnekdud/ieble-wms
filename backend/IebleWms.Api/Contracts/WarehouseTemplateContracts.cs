using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class TemplateObject
{
    [Required,RegularExpression("^(wall|door|aisle|zone|rack|text|shape)$")] public string Type { get; set; } = "shape";
    [Required(AllowEmptyStrings=true),StringLength(200)] public string Label { get; set; } = "";
    [Range(0d,1d)] public double X { get; set; }
    [Range(0d,1d)] public double Y { get; set; }
    [Range(.005,1)] public double Width { get; set; }
    [Range(.005,1)] public double Height { get; set; }
    [Range(-180d,180d)] public double Rotation { get; set; }
    [Required,RegularExpression("^#[0-9a-fA-F]{6}$")] public string Fill { get; set; } = "#dfece7";
    [Required,RegularExpression("^(rectangle|ellipse)$")] public string Shape { get; set; } = "rectangle";
    public int? RackIndex { get; set; }
    public int? ZoneIndex { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class TemplateZone
{
    [Required,StringLength(200)] public string Name { get; set; } = "";
    [Required,StringLength(32),RegularExpression("^[A-Z0-9][A-Z0-9._-]*$")] public string Code { get; set; } = "";
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class TemplateRack : TemplateZone
{
    [Range(1,100)] public int Levels { get; set; }
    [Range(1,100)] public int Bays { get; set; }
    public int? ZoneIndex { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class TemplateDocument
{
    [Range(1,1)] public int SchemaVersion { get; set; } = 1;
    [Range(.25,4)] public double AspectRatio { get; set; } = 1.5;
    [Required,MaxLength(500)] public TemplateObject[] Objects { get; set; } = [];
    [Required,MaxLength(500)] public TemplateZone[] Zones { get; set; } = [];
    [Required,MaxLength(500)] public TemplateRack[] Racks { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SaveWarehouseTemplateRequest
{
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    [Required,StringLength(100)] public string Name { get; set; } = "";
    [StringLength(1000)] public string? Description { get; set; }
    [Required] public TemplateDocument Document { get; set; } = new();
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ArchiveWarehouseTemplateRequest { public Guid Version { get; set; } }
