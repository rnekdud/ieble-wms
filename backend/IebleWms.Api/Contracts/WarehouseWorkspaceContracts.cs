using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class WorkspaceStructureRequest
{
    public Guid ClientId { get; set; }
    public Guid? Id { get; set; }
    public Guid Version { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, StringLength(64)] public string Code { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorkspaceRackRequest : WorkspaceStructureRequest
{
    public Guid? ZoneClientId { get; set; }
    [Range(1, 100)] public int Levels { get; set; } = 1;
    [Range(1, 100)] public int Bays { get; set; } = 1;
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class WorkspaceFloorRequest : WorkspaceStructureRequest
{
    public Guid? ZoneClientId { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SaveWarehouseWorkspaceRequest
{
    public Guid RequestId { get; set; }
    [Required] public WarehouseRequest Warehouse { get; set; } = new();
    [Required, MaxLength(500)] public List<WorkspaceStructureRequest> Zones { get; set; } = [];
    [Required, MaxLength(500)] public List<WorkspaceRackRequest> Racks { get; set; } = [];
    [Required, MaxLength(1000)] public List<WorkspaceFloorRequest> FloorLocations { get; set; } = [];
    // In this endpoint only, ZoneId/RackId/floor LocationId refer to the corresponding ClientId.
    // Existing rack-slot LocationIds are validated by the existing plan service.
    public SaveWarehousePlanRequest? Plan { get; set; }
}

public sealed record WarehouseWorkspaceSaved(Guid WarehouseId, string Code,
    Dictionary<Guid, Guid> Zones, Dictionary<Guid, Guid> Racks,
    Dictionary<Guid, Guid> FloorLocations, Dictionary<string, Guid> RackLocations);
