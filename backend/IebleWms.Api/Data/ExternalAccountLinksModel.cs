using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
public sealed partial class WmsDbContext
{
    public DbSet<ExternalAccountLink> ExternalAccountLinks => Set<ExternalAccountLink>();
    static void ConfigureExternalAccountLinks(ModelBuilder builder)
    {
        ConfigureAudit<ExternalAccountLink>(builder);
        var link=builder.Entity<ExternalAccountLink>();link.HasKey(x=>x.Id);
        link.Property(x=>x.Status).HasMaxLength(24).IsRequired();
        link.Property(x=>x.OwnerSecurityStamp).HasMaxLength(256);
        link.Property(x=>x.Version).IsConcurrencyToken();
        link.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        link.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
        link.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        link.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ApprovedByUserId).OnDelete(DeleteBehavior.Restrict);
        link.HasOne<ExternalCollaborator>().WithMany().HasForeignKey(x=>new{x.TenantId,x.CollaboratorId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        link.HasIndex(x=>new{x.TenantId,x.UserId}).IsUnique().HasFilter("\"Status\" IN ('PendingOwner','OwnerApproved')");
        link.HasIndex(x=>new{x.UserId,x.Status});
        link.ToTable("ExternalAccountLinks",t=>t.HasCheckConstraint("CK_ExternalAccountLink_Status","\"Status\" IN ('PendingOwner','OwnerApproved','Approved','Rejected','Cancelled','Expired')"));
    }
}
