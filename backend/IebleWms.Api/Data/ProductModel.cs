using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class ProductModel
{
    public static void Configure(ModelBuilder b)
    {
        var p=b.Entity<Product>(); p.HasKey(x=>x.Id); p.HasAlternateKey(x=>new{x.TenantId,x.Id});
        p.Property(x=>x.Code).HasMaxLength(64).IsRequired(); p.Property(x=>x.NormalizedCode).HasMaxLength(64).IsRequired();
        p.Property(x=>x.Name).HasMaxLength(200).IsRequired(); p.Property(x=>x.Unit).HasMaxLength(16).IsRequired();
        p.Property(x=>x.Barcode).HasMaxLength(64); p.Property(x=>x.BarcodeType).HasMaxLength(16).IsRequired();
        p.Property(x=>x.Notes).HasMaxLength(2000); p.Property(x=>x.CreationHash).HasMaxLength(64).IsRequired();
        p.Property(x=>x.SafetyStock).HasPrecision(18,3); p.Property(x=>x.Version).IsConcurrencyToken();
        p.Property(x=>x.ModelNumber).HasMaxLength(100); p.Property(x=>x.Origin).HasMaxLength(100);
        p.Property(x=>x.Currency).HasMaxLength(3);
        p.Property(x=>x.OuterPackUnit).HasMaxLength(8).HasDefaultValue("INNER");
        foreach(var field in new[]{"CostPrice","RetailPrice"}) p.Property<decimal?>(field).HasPrecision(18,2);
        foreach(var field in new[]{"WeightGrams","WidthCm","DepthCm","HeightCm","BoxWeightGrams","BoxWidthCm","BoxDepthCm","BoxHeightCm"}) p.Property<decimal?>(field).HasPrecision(18,6);
        p.HasOne<ProductType>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductTypeId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        p.HasIndex(x=>new{x.TenantId,x.NormalizedCode}).IsUnique(); p.HasIndex(x=>new{x.TenantId,x.Barcode}).IsUnique();
        p.HasIndex(x=>x.Barcode).IsUnique().HasFilter("\"BarcodeIsGenerated\" = TRUE");
        p.HasIndex(x=>new{x.TenantId,x.CreationRequestId}).IsUnique(); p.HasIndex(x=>new{x.TenantId,x.IsActive,x.Code});
        p.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<ProductCategory>().WithMany().HasForeignKey(x=>new{x.TenantId,x.CategoryId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        p.ToTable("Products", t=>{
            t.HasCheckConstraint("CK_Products_Code","length(trim(\"Code\")) > 0 AND length(trim(\"NormalizedCode\")) > 0");
            t.HasCheckConstraint("CK_Products_Name","length(trim(\"Name\")) > 0");
            t.HasCheckConstraint("CK_Products_Unit","\"Unit\" IN ('EA','PCS','SET','PAIR','DOZEN','BOX','PACK','CTN','PALLET','ROLL','BAG','BUNDLE','mg','g','kg','ton','oz','lb','ml','L','m³','mm','cm','m','㎡')");
            t.HasCheckConstraint("CK_Products_SafetyStock","\"SafetyStock\" IS NULL OR \"SafetyStock\" BETWEEN 0 AND 999999999.999");
            t.HasCheckConstraint("CK_Products_Barcode","(\"Barcode\" IS NULL OR length(\"Barcode\") BETWEEN 1 AND 64) AND \"BarcodeType\" IN ('Internal','External') AND (NOT \"BarcodeIsGenerated\" OR (\"Barcode\" IS NOT NULL AND \"BarcodeType\" = 'Internal'))");
        });
        var c=b.Entity<ProductCategory>(); c.HasKey(x=>x.Id); c.HasAlternateKey(x=>new{x.TenantId,x.Id});
        c.Property(x=>x.Name).HasMaxLength(100).IsRequired();c.Property(x=>x.NormalizedName).HasMaxLength(100).IsRequired();c.Property(x=>x.Version).IsConcurrencyToken();
        c.HasIndex(x=>new{x.TenantId,x.NormalizedName}).IsUnique();c.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        c.ToTable("ProductCategories",t=>t.HasCheckConstraint("CK_ProductCategories_Name","length(trim(\"Name\")) > 0"));
        c.HasOne<ProductCategory>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ParentId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        var type=b.Entity<ProductType>(); type.HasKey(x=>x.Id);type.HasAlternateKey(x=>new{x.TenantId,x.Id});
        type.Property(x=>x.Name).HasMaxLength(100).IsRequired();type.Property(x=>x.NormalizedName).HasMaxLength(100).IsRequired();type.Property(x=>x.Version).IsConcurrencyToken();
        type.HasIndex(x=>new{x.TenantId,x.NormalizedName}).IsUnique();type.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        var image=b.Entity<ProductImage>();image.HasKey(x=>x.Id);image.Property(x=>x.FileName).HasMaxLength(160);image.Property(x=>x.ContentType).HasMaxLength(64);
        image.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        image.HasIndex(x=>new{x.TenantId,x.ProductId,x.IsPrimary}).IsUnique().HasFilter("\"IsPrimary\" = TRUE");
        image.HasIndex(x=>new{x.TenantId,x.ProductId,x.Position});
        Audit<Product>(b); Audit<ProductCategory>(b); Audit<ProductType>(b);
        var h=b.Entity<ProductChange>();h.HasKey(x=>x.Id);h.Property(x=>x.Action).HasMaxLength(64).IsRequired();
        h.HasIndex(x=>new{x.TenantId,x.TargetId,x.Id});h.HasOne<Tenant>().WithMany().HasForeignKey(x=>x.TenantId).OnDelete(DeleteBehavior.Restrict);
        h.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
    static void Audit<T>(ModelBuilder b) where T:AuditableEntity
    {
        b.Entity<T>().HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<T>().HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
