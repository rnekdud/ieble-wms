namespace IebleWms.Api.Models;

public enum TenantRole { Employee = 0, Administrator = 1, Master = 2 }

public sealed class TenantMembership : AuditableEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public TenantRole Role { get; set; } = TenantRole.Employee;
    public bool IsActive { get; set; } = true;
}
