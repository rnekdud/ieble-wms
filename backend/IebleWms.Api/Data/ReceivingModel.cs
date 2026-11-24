using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class ReceivingModel
{
    public static void Configure(ModelBuilder b)
    {
        var r=b.Entity<InboundReceipt>();r.HasKey(x=>x.Id);r.HasAlternateKey(x=>new{x.TenantId,x.Id});
        r.Property(x=>x.Number).HasMaxLength(64);r.Property(x=>x.Status).HasMaxLength(16);r.Property(x=>x.RequestHash).HasMaxLength(64);
        r.Property(x=>x.ContactName).HasMaxLength(200);r.Property(x=>x.Notes).HasMaxLength(2000);r.Property(x=>x.PartnerName).HasMaxLength(200);r.Property(x=>x.WarehouseName).HasMaxLength(200);
        r.Property(x=>x.Version).IsConcurrencyToken();r.HasIndex(x=>new{x.TenantId,x.Number}).IsUnique();r.HasIndex(x=>new{x.TenantId,x.RequestId}).IsUnique();r.HasIndex(x=>new{x.TenantId,x.ExpectedDate,x.Status});
        r.HasOne<Partner>().WithMany().HasForeignKey(x=>new{x.TenantId,x.PartnerId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        r.HasOne<Warehouse>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId}).OnDelete(DeleteBehavior.Restrict);
        r.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.InspectedByUserId).OnDelete(DeleteBehavior.Restrict);r.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ConfirmedByUserId).OnDelete(DeleteBehavior.Restrict);
        r.ToTable("InboundReceipts",t=>t.HasCheckConstraint("CK_Receipt_Status","\"Status\" IN ('Planned','Inspecting','Confirmed','Cancelled')"));Audit<InboundReceipt>(b);
        var photo=b.Entity<ReceiptPhoto>();photo.HasKey(x=>x.Id);
        photo.Property(x=>x.FileName).HasMaxLength(160);photo.Property(x=>x.ContentType).HasMaxLength(40);
        photo.HasIndex(x=>new{x.TenantId,x.ReceiptId,x.Position});
        photo.HasOne<InboundReceipt>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ReceiptId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        var l=b.Entity<InboundReceiptLine>();l.HasKey(x=>x.Id);l.HasAlternateKey(x=>new{x.TenantId,x.Id});
        l.HasOne<InboundReceipt>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ReceiptId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        l.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        l.HasOne<WarehouseRack>().WithMany().HasForeignKey(x=>new{x.TenantId,x.PlannedRackWarehouseId,x.PlannedRackId}).OnDelete(DeleteBehavior.Restrict);
        l.Property(x=>x.ProductCode).HasMaxLength(64);l.Property(x=>x.ProductName).HasMaxLength(200);l.Property(x=>x.Unit).HasMaxLength(16);l.Property(x=>x.LotNumber).HasMaxLength(100);
        l.Property(x=>x.ExpectedQuantity).HasPrecision(18,3);l.Property(x=>x.InspectedQuantity).HasPrecision(18,3);
        l.ToTable("InboundReceiptLines",t=>t.HasCheckConstraint("CK_ReceiptLine_Quantity","\"ExpectedQuantity\" > 0 AND (\"InspectedQuantity\" IS NULL OR \"InspectedQuantity\" >= 0)"));
        var s=b.Entity<StockBalance>();s.HasKey(x=>x.Id);s.HasAlternateKey(x=>new{x.TenantId,x.Id});s.Property(x=>x.Version).IsConcurrencyToken();
        s.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId,x.LocationId}).OnDelete(DeleteBehavior.Restrict);
        s.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        s.HasOne<InboundReceiptLine>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ReceiptLineId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        s.Property(x=>x.SourceKey).HasMaxLength(80);s.Property(x=>x.Unit).HasMaxLength(16);s.Property(x=>x.LotNumber).HasMaxLength(100);s.Property(x=>x.SerialNumber).HasMaxLength(100);
        s.Property(x=>x.Quantity).HasPrecision(18,3);s.Property(x=>x.ReservedQuantity).HasPrecision(18,3);
        s.HasIndex(x=>new{x.TenantId,x.SourceKey}).IsUnique();s.HasIndex(x=>new{x.TenantId,x.ProductId,x.SerialNumber}).IsUnique();s.HasIndex(x=>new{x.TenantId,x.WarehouseId,x.ProductId});
        s.ToTable("StockBalances",t=>t.HasCheckConstraint("CK_Stock_Quantity","\"Quantity\" >= 0 AND \"ReservedQuantity\" >= 0 AND \"ReservedQuantity\" <= \"Quantity\""));Audit<StockBalance>(b);
        var m=b.Entity<StockMovement>();m.HasKey(x=>x.Id);m.Property(x=>x.Type).HasMaxLength(32);m.Property(x=>x.Quantity).HasPrecision(18,3);
        m.HasOne<StockBalance>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StockId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        m.HasOne<InboundReceipt>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ReceiptId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        m.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);m.HasIndex(x=>new{x.TenantId,x.StockId,x.ReceiptId}).IsUnique();
        var a=b.Entity<ReceiptChange>();a.HasKey(x=>x.Id);a.Property(x=>x.Action).HasMaxLength(32);
        a.Property(x=>x.ScanRequestHash).HasMaxLength(64);a.Property(x=>x.Barcode).HasMaxLength(64);a.Property(x=>x.Reason).HasMaxLength(500);
        a.Property(x=>x.PreviousQuantity).HasPrecision(18,3);a.Property(x=>x.Quantity).HasPrecision(18,3);
        a.HasIndex(x=>new{x.TenantId,x.ScanRequestId}).IsUnique().HasFilter("\"ScanRequestId\" IS NOT NULL");
        a.HasOne<InboundReceipt>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ReceiptId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);a.HasIndex(x=>new{x.TenantId,x.ReceiptId,x.Id});
    }
    static void Audit<T>(ModelBuilder b) where T:AuditableEntity
    {
        b.Entity<T>().HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<T>().HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
