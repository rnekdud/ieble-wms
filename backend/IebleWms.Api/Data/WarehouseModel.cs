using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace IebleWms.Api.Data;

internal static class WarehouseModel
{
    private static EntityTypeBuilder<T> Item<T>(ModelBuilder builder, string table, int codeLength) where T : AuditableEntity, IStorageItem
    {
        var e = builder.Entity<T>();
        e.ToTable(table, t => {
            t.HasCheckConstraint($"CK_{table}_Name", "length(trim(\"Name\")) > 0");
            t.HasCheckConstraint($"CK_{table}_Code", "length(\"Code\") > 0 AND \"Code\" = upper(trim(\"Code\"))");
        });
        e.Property(x => x.Name).HasMaxLength(200).IsRequired();
        e.Property(x => x.Code).HasMaxLength(codeLength).IsRequired();
        e.Property(x => x.Version).IsConcurrencyToken();
        e.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        return e;
    }
    public static void Configure(ModelBuilder builder)
    {
        var receipt = builder.Entity<WarehouseSaveReceipt>();
        receipt.HasKey(x => new { x.TenantId, x.RequestId });
        receipt.Property(x => x.RequestHash).HasMaxLength(64).IsRequired();
        receipt.Property(x => x.ResponseJson).IsRequired();
        receipt.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).OnDelete(DeleteBehavior.Restrict);
        receipt.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
        var w = Item<Warehouse>(builder, "Warehouses", 32);
        w.HasKey(x => new { x.TenantId, x.Id });
        w.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        w.Property(x => x.CustomCode).HasMaxLength(64);
        w.Property(x => x.NormalizedCustomCode).HasMaxLength(64);
        w.HasIndex(x => new { x.TenantId, x.NormalizedCustomCode }).IsUnique();
        w.HasIndex(x => new { x.TenantId, x.CreationRequestId }).IsUnique();
        w.Property(x => x.TypeDescription).HasMaxLength(500);
        w.Property(x => x.Type).HasMaxLength(100);
        w.Property(x => x.Address).HasMaxLength(500);
        w.Property(x => x.AddressDetail).HasMaxLength(300);
        w.Property(x => x.ContactName).HasMaxLength(200);
        w.Property(x => x.Notes).HasMaxLength(2000);
        var z = Item<WarehouseZone>(builder, "WarehouseZones", 32);
        z.HasKey(x => new { x.TenantId, x.WarehouseId, x.Id });
        z.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Code }).IsUnique();
        z.HasIndex(x => new { x.TenantId, x.WarehouseId, x.CreationRequestId }).IsUnique();
        z.Property(x => x.CreationRequestHash).HasMaxLength(64);
        z.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).OnDelete(DeleteBehavior.Restrict);
        var r = Item<WarehouseRack>(builder, "WarehouseRacks", 32);
        r.HasKey(x => new { x.TenantId, x.WarehouseId, x.Id });
        r.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Code }).IsUnique();
        r.HasIndex(x => new { x.TenantId, x.WarehouseId, x.CreationRequestId }).IsUnique();
        r.Property(x => x.CreationRequestHash).HasMaxLength(64);
        r.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).OnDelete(DeleteBehavior.Restrict);
        r.HasOne<WarehouseZone>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId, x.ZoneId }).OnDelete(DeleteBehavior.Restrict);
        r.ToTable("WarehouseRacks", t => t.HasCheckConstraint("CK_Racks_Dimensions", "\"Levels\" BETWEEN 1 AND 100 AND \"Bays\" BETWEEN 1 AND 100 AND \"Levels\" * \"Bays\" <= 1000"));
        var l = Item<StorageLocation>(builder, "StorageLocations", 64);
        l.HasKey(x => new { x.TenantId, x.WarehouseId, x.Id });
        l.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Code }).IsUnique();
        l.HasIndex(x => new { x.TenantId, x.WarehouseId, x.RackId, x.Level, x.Bay }).IsUnique();
        l.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).OnDelete(DeleteBehavior.Restrict);
        l.HasOne<WarehouseZone>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId, x.ZoneId }).OnDelete(DeleteBehavior.Restrict);
        l.HasOne<WarehouseRack>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId, x.RackId }).OnDelete(DeleteBehavior.Restrict);
        l.ToTable("StorageLocations", t => t.HasCheckConstraint("CK_Locations_ParentSlot", "(\"RackId\" IS NULL AND \"Level\" IS NULL AND \"Bay\" IS NULL) OR (\"RackId\" IS NOT NULL AND \"ZoneId\" IS NULL AND \"Level\" IS NOT NULL AND \"Bay\" IS NOT NULL AND \"Level\" >= 1 AND \"Bay\" >= 1)"));
        var a = builder.Entity<WarehouseChange>();
        a.HasKey(x => x.Id);
        a.Property(x => x.Action).HasMaxLength(64).IsRequired();
        a.HasIndex(x => new { x.TenantId, x.WarehouseId, x.Id });
        a.HasOne<Warehouse>().WithMany().HasForeignKey(x => new { x.TenantId, x.WarehouseId }).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
