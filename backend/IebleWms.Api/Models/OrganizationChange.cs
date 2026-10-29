namespace IebleWms.Api.Models;

// Immutable history: credentials, password hashes and security stamps must never be included.
public sealed class OrganizationChange
{
    public long Id { get; set; }
    public Guid? TenantId { get; set; }
    public Guid? TargetUserId { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
    public string? Reason { get; set; }
}
