using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class WarehouseTemplateModel
{
    public static void Configure(ModelBuilder b)
    {
        var e=b.Entity<WarehouseTemplate>();e.HasKey(x=>new{x.TenantId,x.Id});
        e.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        e.Property(x=>x.Name).HasMaxLength(100).IsRequired();e.Property(x=>x.Description).HasMaxLength(1000);
        e.Property(x=>x.DocumentJson).IsRequired();e.Property(x=>x.RequestHash).HasMaxLength(64).IsRequired();
        e.Property(x=>x.Version).IsConcurrencyToken();e.HasIndex(x=>new{x.TenantId,x.RequestId}).IsUnique();
        e.HasIndex(x=>new{x.TenantId,x.IsActive,x.UpdatedAt});
        e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
