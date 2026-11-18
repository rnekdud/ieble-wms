namespace IebleWms.Api.Models;

// Built-in role metadata is optional: absent rows keep the original role identifier/name.
// Custom roles always have an ID; membership.Role remains Employee, never Administrator.
public sealed class PermissionGrade : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string? SystemRole { get; set; }
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
