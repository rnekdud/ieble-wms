namespace IebleWms.Api.Models;

public enum TenantServiceStatus { PendingActivation = 0, Active = 1, Suspended = 2, Rejected = 3 }

// PendingActivation and Rejected are retained only to read historical audit records.
public enum TenantBillingStatus { CardRequired = 0, PaymentRequired = 1, Paid = 2 }

public sealed class Tenant : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? BusinessRegistrationNumber { get; set; }
    public string? RepresentativeName { get; set; }
    public string? Address { get; set; }
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public TenantServiceStatus ServiceStatus { get; set; } = TenantServiceStatus.Active;
    public TenantBillingStatus BillingStatus { get; set; } = TenantBillingStatus.CardRequired;
    // Version 1 retains the existing calendar-month contract. Only new signups use version 2.
    public int BillingPolicyVersion { get; set; } = 1;
    public DateTimeOffset? TrialStartedAt { get; set; }
    public DateTimeOffset? TrialEndsAt { get; set; }
    public DateTimeOffset? FirstChargeAt { get; set; }
    public int? BillingAnchorDay { get; set; }
    public string BillingTimeZone { get; set; } = "Asia/Seoul";
    public DateTimeOffset? PaidThrough { get; set; }
    public DateTimeOffset? AutoBillingCanceledAt { get; set; }
    public DateTimeOffset? ServiceEndsAt { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}
