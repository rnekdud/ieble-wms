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
    public TenantServiceStatus ServiceStatus { get; set; } = TenantServiceStatus.Active;
    public TenantBillingStatus BillingStatus { get; set; } = TenantBillingStatus.CardRequired;
    public bool IsActive { get; set; } = true;
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}
