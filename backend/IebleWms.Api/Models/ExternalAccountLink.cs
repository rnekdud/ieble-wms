namespace IebleWms.Api.Models;

// Retained historical records only. The account-link workflow and its API have been retired.
// Keep the mapping and migration so existing databases and audit references remain intact.
public sealed class ExternalAccountLink : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public Guid CollaboratorId { get; set; }
    public Guid RequestedByUserId { get; set; }
    public string Status { get; set; } = "PendingOwner";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? OwnerApprovedAt { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public string? OwnerSecurityStamp { get; set; }
}
