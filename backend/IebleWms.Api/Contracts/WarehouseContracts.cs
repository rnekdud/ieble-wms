using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class StorageItemRequest
{
    public Guid Version { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, StringLength(64)] public string Code { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WarehouseRequest
{
    public Guid Version { get; set; }
    public Guid? RequestId { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    // Accepted for stale clients only; new codes are always server-generated. Updates cannot change it.
    [StringLength(32)] public string? Code { get; set; }
    [StringLength(64)] public string? CustomCode { get; set; }
    [StringLength(500)] public string? TypeDescription { get; set; }
    public bool IsActive { get; set; } = true;
    [StringLength(100)] public string? Type { get; set; }
    [StringLength(500)] public string? Address { get; set; }
    [StringLength(300)] public string? AddressDetail { get; set; }
    [StringLength(200)] public string? ContactName { get; set; }
    [StringLength(2000)] public string? Notes { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class RackRequest : StorageItemRequest
{
    public Guid? ZoneId { get; set; }
    [Range(1, 100)] public int Levels { get; set; } = 1;
    [Range(1, 100)] public int Bays { get; set; } = 1;
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class CreateLocationRequest : StorageItemRequest
{
    public Guid? ZoneId { get; set; }
}
