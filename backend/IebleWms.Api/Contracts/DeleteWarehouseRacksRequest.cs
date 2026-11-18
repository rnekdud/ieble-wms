using System.ComponentModel.DataAnnotations;
namespace IebleWms.Api.Contracts;
public sealed class DeleteWarehouseRacksRequest
{
    [Required, MaxLength(500)] public List<DeleteWarehouseRack> Zones { get; set; } = [];
    public Guid PlanVersion { get; set; }
    [Required, MaxLength(500)] public List<DeleteWarehouseRack> Racks { get; set; } = [];
}
public sealed record DeleteWarehouseRack(Guid Id, Guid Version);
