namespace IebleWms.Api.Models;

public sealed class Tenant : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}
