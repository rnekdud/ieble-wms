namespace IebleWms.Api.Models;

public sealed class TenantStatusChange
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public TenantServiceStatus FromStatus { get; set; }
    public TenantServiceStatus ToStatus { get; set; }
    public Guid ChangedByUserId { get; set; }
    public ApplicationUser ChangedByUser { get; set; } = null!;
    public DateTimeOffset ChangedAt { get; set; }
    public string Reason { get; set; } = "";
}

// Permanent singleton receipt. Disabling/demoting the initial account does not reopen bootstrap.
public sealed class AdministratorBootstrap
{
    public int Id { get; set; } = 1;
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
}
