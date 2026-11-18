namespace IebleWms.Api.Models;

// Separate local development entitlement; never a payment/card/trial record.
public sealed class DevelopmentAccessGrant
{
    public Guid TenantId { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public DateTimeOffset GrantedAt { get; set; }
    public string GrantedBy { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
}
public sealed class DevelopmentAccessChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public string Action { get; set; } = "";
    public string Operator { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset ChangedAt { get; set; }
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
