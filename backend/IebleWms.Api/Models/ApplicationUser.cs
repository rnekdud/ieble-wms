using Microsoft.AspNetCore.Identity;

namespace IebleWms.Api.Models;

// Platform authority is independent of membership in any tenant.
public enum SystemRole { None = 0, IebleAdministrator = 1 }

public sealed class ApplicationUser : IdentityUser<Guid>, IAuditableEntity
{
    public ApplicationUser() => Id = Guid.NewGuid();

    public string DisplayName { get; set; } = string.Empty;
    public SystemRole SystemRole { get; set; } = SystemRole.None;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public Guid? UpdatedByUserId { get; set; }
    public ICollection<TenantMembership> Memberships { get; set; } = new List<TenantMembership>();
}
