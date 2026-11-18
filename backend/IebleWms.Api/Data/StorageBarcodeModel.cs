using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Data;

internal static class StorageBarcodeModel
{
    public static void Configure(ModelBuilder builder, bool postgres)
    {
        var b = builder.Entity<StorageBarcode>();
        b.HasKey(x => x.Id);
        if(postgres) builder.HasSequence<long>("InternalBarcodeNumbers").StartsAt(1).HasMax(99999999999999999L);
        b.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        b.Property(x=>x.Description).HasMaxLength(200);
        b.Property(x=>x.BarcodeType).HasMaxLength(16);
        b.Property(x=>x.PackageCode).HasMaxLength(8).HasDefaultValue("EA");
        b.HasIndex(x=>new{x.TenantId,x.ProductId});
        b.HasIndex(x=>new{x.TenantId,x.ProductId,x.IsPrimary}).IsUnique().HasFilter("\"ProductId\" IS NOT NULL AND \"IsPrimary\" = TRUE");
        b.Property(x => x.Value).HasMaxLength(64).IsRequired();
        b.HasIndex(x => new { x.TenantId, x.Value }).IsUnique();
        b.HasIndex(x => x.Value).IsUnique().HasFilter("\"IsGenerated\" = TRUE");
        b.HasOne<WarehouseRack>().WithOne(x => x.BarcodeRegistration)
            .HasForeignKey<StorageBarcode>(x => new { x.TenantId, x.WarehouseId, x.RackId }).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<StorageLocation>().WithOne(x=>x.BarcodeRegistration)
            .HasForeignKey<StorageBarcode>(x => new { x.TenantId, x.WarehouseId, x.LocationId }).OnDelete(DeleteBehavior.Restrict);
        b.ToTable("StorageBarcodes", t => {
            t.HasCheckConstraint("CK_StorageBarcodes_Owner", "(\"ProductId\" IS NOT NULL AND \"WarehouseId\" IS NULL AND \"RackId\" IS NULL AND \"LocationId\" IS NULL) OR (\"ProductId\" IS NULL AND \"WarehouseId\" IS NOT NULL AND ((\"RackId\" IS NOT NULL AND \"LocationId\" IS NULL) OR (\"RackId\" IS NULL AND \"LocationId\" IS NOT NULL)))");
            t.HasCheckConstraint("CK_StorageBarcodes_Length", "length(\"Value\") BETWEEN 1 AND 64");
        });
        builder.Entity<StorageLocation>().Navigation(x => x.BarcodeRegistration).AutoInclude();
        builder.Entity<WarehouseRack>().Navigation(x => x.BarcodeRegistration).AutoInclude();
    }
}
