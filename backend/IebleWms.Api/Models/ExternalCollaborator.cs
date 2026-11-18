namespace IebleWms.Api.Models;

// One stable supplier relationship inside one WMS tenant. A name is never an identity key.
public sealed class ExternalCollaborator : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? PartnerId { get; set; }
    public Partner? Partner { get; set; }
    public string Name { get; set; } = "";
    public string? BusinessRegistrationNumber { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;
    public string PermissionsJson { get; set; } = "{}";
}
public sealed class CollaboratorPermissionChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid CollaboratorId { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
