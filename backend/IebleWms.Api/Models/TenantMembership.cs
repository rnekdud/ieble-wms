namespace IebleWms.Api.Models;

public enum TenantRole { Employee = 0, Administrator = 1, Master = 2 }

public sealed class TenantMembership : AuditableEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    // Account classification and grants belong to this tenant relationship, not the global login.
    public string AccountType { get; set; } = "Internal";
    public Guid? CollaboratorId { get; set; }
    public ExternalCollaborator? Collaborator { get; set; }
    public bool UseIndividualPermissions { get; set; }
    public Guid? PartnerId { get; set; }
    public string? CompanyName { get; set; }
    public string? BusinessRegistrationNumber { get; set; }
    public string? CompanyPhone { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactEmail { get; set; }
    public string ExternalPermissionsJson { get; set; } = "{}";
    public Guid? DepartmentId { get; set; }
    public Guid? PositionId { get; set; }
    public string? DisplayName { get; set; }
    public DateTimeOffset? BillingStartsAt { get; set; }
    // Reserved for a future, explicitly agreed billing termination policy.
    public DateTimeOffset? BillingEndsAt { get; set; }
    public DateTimeOffset? DeactivatedAt { get; set; }
    public Guid? PermissionGradeId { get; set; }
    public TenantRole Role { get; set; } = TenantRole.Employee;
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
}
