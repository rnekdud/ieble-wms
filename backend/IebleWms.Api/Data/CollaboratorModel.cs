using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Data;
public partial class WmsDbContext
{
    private static void ConfigureCollaborators(ModelBuilder b)
    {
        var c = b.Entity<ExternalCollaborator>();
        c.HasKey(x => x.Id); c.HasAlternateKey(x => new { x.TenantId, x.Id });
        c.Property(x => x.Name).HasMaxLength(200).IsRequired();
        c.Property(x => x.BusinessRegistrationNumber).HasMaxLength(64); c.Property(x => x.Phone).HasMaxLength(50);
        c.Property(x => x.PermissionsJson).HasDefaultValue("{}").IsRequired(); c.Property(x => x.Version).IsConcurrencyToken();
        c.HasIndex(x => new { x.TenantId, x.PartnerId }).IsUnique().HasFilter("\"PartnerId\" IS NOT NULL");
        c.HasIndex(x => new { x.TenantId, x.Name });
        c.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        c.HasOne(x => x.Partner).WithMany().HasForeignKey(x => new { x.TenantId, x.PartnerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        c.ToTable("ExternalCollaborators", t => t.HasCheckConstraint("CK_Collaborator_Name", "length(trim(\"Name\")) > 0"));
        ConfigureAudit<ExternalCollaborator>(b);
        var h = b.Entity<CollaboratorPermissionChange>(); h.HasKey(x => x.Id);
        h.HasIndex(x => new { x.TenantId, x.CollaboratorId, x.Id });
        h.HasOne<ExternalCollaborator>().WithMany().HasForeignKey(x => new { x.TenantId, x.CollaboratorId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        h.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
