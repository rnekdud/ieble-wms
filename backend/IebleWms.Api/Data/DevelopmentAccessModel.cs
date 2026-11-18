using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class DevelopmentAccessModel
{
    public static void Configure(ModelBuilder builder)
    {
        var grant=builder.Entity<DevelopmentAccessGrant>();grant.HasKey(x=>x.TenantId);
        grant.Property(x=>x.Version).IsConcurrencyToken();grant.Property(x=>x.GrantedBy).HasMaxLength(256).IsRequired();grant.Property(x=>x.Reason).HasMaxLength(1000).IsRequired();
        grant.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        grant.ToTable("DevelopmentAccessGrants",t=>t.HasCheckConstraint("CK_DevelopmentAccessGrants_Period","\"EndsAt\" > \"StartsAt\""));
        var change=builder.Entity<DevelopmentAccessChange>();change.HasKey(x=>x.Id);
        change.Property(x=>x.Action).HasMaxLength(32).IsRequired();change.Property(x=>x.Operator).HasMaxLength(256).IsRequired();change.Property(x=>x.Reason).HasMaxLength(1000).IsRequired();
        change.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        change.HasIndex(x=>new{x.TenantId,x.Id});
        change.ToTable("DevelopmentAccessChanges",t=>t.HasCheckConstraint("CK_DevelopmentAccessChanges_Action","\"Action\" IN ('Granted','Revoked')"));
    }
}
