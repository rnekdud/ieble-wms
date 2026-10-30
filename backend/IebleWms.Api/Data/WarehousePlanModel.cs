using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class WarehousePlanModel
{
    public static void Configure(ModelBuilder b)
    {
        var p=b.Entity<WarehousePlan>();
        p.HasKey(x=>new{x.TenantId,x.WarehouseId});
        p.HasOne<Warehouse>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId}).OnDelete(DeleteBehavior.Restrict);
        p.Property(x=>x.Version).IsConcurrencyToken();
        p.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        p.ToTable("WarehousePlans",t=>t.HasCheckConstraint("CK_WarehousePlans_Schema","\"SchemaVersion\" = 1 AND \"AspectRatio\" BETWEEN 0.25 AND 4"));
        var o=b.Entity<WarehousePlanObject>();
        o.HasKey(x=>new{x.TenantId,x.WarehouseId,x.Id});
        o.HasOne<WarehousePlan>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<WarehouseRack>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId,x.RackId}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<WarehouseZone>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId,x.ZoneId}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId,x.LocationId}).OnDelete(DeleteBehavior.Restrict);
        o.Property(x=>x.Type).HasMaxLength(16).IsRequired();o.Property(x=>x.Label).HasMaxLength(200).IsRequired();o.Property(x=>x.Fill).HasMaxLength(7).IsRequired();o.Property(x=>x.Shape).HasMaxLength(16).IsRequired();
        o.ToTable("WarehousePlanObjects",t=>{
            t.HasCheckConstraint("CK_PlanObjects_Zone", "\"ZoneId\" IS NULL OR \"Type\" = 'zone'");
            t.HasCheckConstraint("CK_PlanObjects_Type","\"Type\" IN ('wall','zone','rack','aisle','door','text','shape') AND \"Shape\" IN ('rectangle','ellipse') AND (\"RackId\" IS NULL OR \"Type\" = 'rack')");
            t.HasCheckConstraint("CK_PlanObjects_Geometry","\"X\" BETWEEN 0 AND 1 AND \"Y\" BETWEEN 0 AND 1 AND \"Width\" BETWEEN 0.005 AND 1 AND \"Height\" BETWEEN 0.005 AND 1 AND \"Rotation\" BETWEEN -180 AND 180 AND \"SortOrder\" >= 0");
        });
    }
}
