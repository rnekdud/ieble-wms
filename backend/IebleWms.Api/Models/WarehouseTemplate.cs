namespace IebleWms.Api.Models;
// Design-only data. Physical identities, barcodes and stock are not represented in the document contract.
public sealed class WarehouseTemplate : AuditableEntity
{
    public Guid TenantId { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string DocumentJson { get; set; } = "";
    public int RackCount { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid RequestId { get; set; }
    public string RequestHash { get; set; } = "";
}
