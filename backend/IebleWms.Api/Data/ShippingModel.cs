using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class ShippingModel
{
    public static void Configure(ModelBuilder b)
    {
        var d=b.Entity<OutboundShipment>();d.HasKey(x=>x.Id);d.HasAlternateKey(x=>new{x.TenantId,x.Id});d.Property(x=>x.Version).IsConcurrencyToken();
        d.Property(x => x.ShippingPostalCode).HasMaxLength(20);
        d.Property(x=>x.Number).HasMaxLength(64);d.Property(x=>x.Status).HasMaxLength(16);d.Property(x=>x.RequestHash).HasMaxLength(64);
        d.Property(x=>x.ContactName).HasMaxLength(200);d.Property(x=>x.Notes).HasMaxLength(2000);d.Property(x=>x.PartnerName).HasMaxLength(200);d.Property(x=>x.WarehouseName).HasMaxLength(200);
        d.Property(x=>x.ShippingAddress).HasMaxLength(500);d.Property(x=>x.ShippingAddressDetail).HasMaxLength(500);
        d.HasIndex(x=>new{x.TenantId,x.Number}).IsUnique();d.HasIndex(x=>new{x.TenantId,x.RequestId}).IsUnique();d.HasIndex(x=>new{x.TenantId,x.ExpectedDate,x.Status});
        d.HasOne<Partner>().WithMany().HasForeignKey(x=>new{x.TenantId,x.PartnerId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<Warehouse>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId}).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.PickedByUserId).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.InspectedByUserId).OnDelete(DeleteBehavior.Restrict);
        d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ConfirmedByUserId).OnDelete(DeleteBehavior.Restrict);
        d.ToTable("OutboundShipments",t=>t.HasCheckConstraint("CK_Shipment_Status","\"Status\" IN ('Requested','Picking','Picked','Inspected','Confirmed','Cancelled')"));
        var l=b.Entity<OutboundShipmentLine>();l.HasOne<WarehouseRack>().WithMany().HasForeignKey(x=>new{x.TenantId,x.PlannedRackWarehouseId,x.PlannedRackId}).OnDelete(DeleteBehavior.Restrict);l.HasKey(x=>x.Id);l.HasAlternateKey(x=>new{x.TenantId,x.Id});
        l.HasOne<OutboundShipment>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ShipmentId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        l.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        l.Property(x=>x.ProductCode).HasMaxLength(64);l.Property(x=>x.ProductName).HasMaxLength(200);l.Property(x=>x.Unit).HasMaxLength(16);l.Property(x=>x.LotNumber).HasMaxLength(100);l.Property(x=>x.RequestedQuantity).HasPrecision(18,3);
        l.ToTable("OutboundShipmentLines",t=>t.HasCheckConstraint("CK_ShipmentLine_Quantity","\"RequestedQuantity\" > 0"));
        var a=b.Entity<ShipmentAllocation>();
        a.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.SourceWarehouseId,x.SourceLocationId}).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<WarehouseRack>().WithMany().HasForeignKey(x=>new{x.TenantId,x.SourceWarehouseId,x.SourceRackId}).OnDelete(DeleteBehavior.Restrict);
        a.HasKey(x=>x.Id);a.HasIndex(x=>new{x.TenantId,x.LineId,x.StockId}).IsUnique();
        a.HasOne<OutboundShipmentLine>().WithMany().HasForeignKey(x=>new{x.TenantId,x.LineId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<StockBalance>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StockId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.PickedByUserId).OnDelete(DeleteBehavior.Restrict);a.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.InspectedByUserId).OnDelete(DeleteBehavior.Restrict);
        a.Property(x=>x.LocationCode).HasMaxLength(100);a.Property(x=>x.RackCode).HasMaxLength(100);a.Property(x=>x.LotNumber).HasMaxLength(100);a.Property(x=>x.SerialNumber).HasMaxLength(100);a.Property(x=>x.State).HasMaxLength(16);
        a.Property(x=>x.Quantity).HasPrecision(18,3);a.Property(x=>x.PickedQuantity).HasPrecision(18,3);a.Property(x=>x.InspectedQuantity).HasPrecision(18,3);
        a.ToTable("ShipmentAllocations",t=>{t.HasCheckConstraint("CK_Allocation_Quantity","\"Quantity\" > 0 AND \"PickedQuantity\" >= 0 AND \"PickedQuantity\" <= \"Quantity\" AND \"InspectedQuantity\" >= 0 AND \"InspectedQuantity\" <= \"PickedQuantity\"");t.HasCheckConstraint("CK_Allocation_State","\"State\" IN ('Active','Released','Consumed')");});
        var c=b.Entity<ShipmentChange>();
        c.HasIndex(x=>new{x.TenantId,x.ScanRequestId}).IsUnique().HasFilter("\"ScanRequestId\" IS NOT NULL");
        c.Property(x=>x.ScanRequestHash).HasMaxLength(64);c.Property(x=>x.Barcode).HasMaxLength(64);
        c.Property(x=>x.PreviousQuantity).HasPrecision(18,3);c.Property(x=>x.Quantity).HasPrecision(18,3);c.HasKey(x=>x.Id);c.Property(x=>x.Action).HasMaxLength(32);
        c.HasOne<OutboundShipment>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ShipmentId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        c.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);c.HasIndex(x=>new{x.TenantId,x.ShipmentId,x.Id});
        var m=b.Entity<StockMovement>();m.HasOne<OutboundShipment>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ShipmentId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        m.HasIndex(x=>new{x.TenantId,x.StockId,x.ShipmentId}).IsUnique();

    }
}
