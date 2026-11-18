using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class InventoryModel
{
    public static void Configure(ModelBuilder b)
    {
        var o=b.Entity<InventoryOperation>();o.HasKey(x=>x.Id);o.HasAlternateKey(x=>new{x.TenantId,x.Id});
        o.HasIndex(x=>new{x.TenantId,x.Number}).IsUnique();o.HasIndex(x=>new{x.TenantId,x.RequestId}).IsUnique();o.HasIndex(x=>new{x.TenantId,x.ProductId,x.Type});
        o.Property(x=>x.Number).HasMaxLength(64);o.Property(x=>x.RequestHash).HasMaxLength(64);o.Property(x=>x.Type).HasMaxLength(16);
        o.Property(x=>x.ProductCode).HasMaxLength(64);o.Property(x=>x.ProductName).HasMaxLength(200);o.Property(x=>x.Unit).HasMaxLength(16);o.Property(x=>x.LotNumber).HasMaxLength(100);o.Property(x=>x.SerialNumber).HasMaxLength(100);
        o.Property(x=>x.SourceLabel).HasMaxLength(600);o.Property(x=>x.DestinationLabel).HasMaxLength(600);o.Property(x=>x.Reason).HasMaxLength(300);o.Property(x=>x.Notes).HasMaxLength(2000);o.Property(x=>x.ActorName).HasMaxLength(200);
        foreach(var name in new[]{"Quantity","BeforeSource","AfterSource","BeforeDestination","AfterDestination"})o.Property<decimal>(name).HasPrecision(18,3);
        o.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<StockBalance>().WithMany().HasForeignKey(x=>new{x.TenantId,x.SourceStockId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<StockBalance>().WithMany().HasForeignKey(x=>new{x.TenantId,x.DestinationStockId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.SourceWarehouseId,x.SourceLocationId}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.DestinationWarehouseId,x.DestinationLocationId}).OnDelete(DeleteBehavior.Restrict);
        o.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);
        o.ToTable("InventoryOperations",t=>{t.HasCheckConstraint("CK_InventoryOperation_Type","\"Type\" IN ('Move','Increase','Decrease')");t.HasCheckConstraint("CK_InventoryOperation_Quantity","\"Quantity\" > 0 AND \"BeforeSource\" >= 0 AND \"AfterSource\" >= 0 AND \"BeforeDestination\" >= 0 AND \"AfterDestination\" >= 0");});
        var c=b.Entity<InventoryChange>();c.HasKey(x=>x.Id);c.HasIndex(x=>new{x.TenantId,x.OperationId}).IsUnique();
        c.HasOne<InventoryOperation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.OperationId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);c.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);
        var m=b.Entity<StockMovement>();m.HasOne<InventoryOperation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.OperationId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
        m.HasIndex(x=>new{x.TenantId,x.StockId,x.OperationId,x.Type}).IsUnique();
        m.ToTable("StockMovements",t=>t.HasCheckConstraint("CK_StockMovement_Source","(\"StocktakeId\" IS NULL AND ((\"OperationId\" IS NULL AND ((\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0))) OR (\"OperationId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" IN ('MoveIn','AdjustmentIncrease') AND \"Quantity\" > 0) OR (\"Type\" IN ('MoveOut','AdjustmentDecrease') AND \"Quantity\" < 0))))) OR (\"StocktakeId\" IS NOT NULL AND \"OperationId\" IS NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" = 'StocktakeIncrease' AND \"Quantity\" > 0) OR (\"Type\" = 'StocktakeDecrease' AND \"Quantity\" < 0)))"));
        b.Entity<StockBalance>().ToTable("StockBalances",t=>t.HasCheckConstraint("CK_Stock_SerialQuantity","\"SerialNumber\" IS NULL OR (CAST(\"Quantity\" AS NUMERIC) IN (0,1) AND CAST(\"ReservedQuantity\" AS NUMERIC) IN (0,1))"));
    }
}
