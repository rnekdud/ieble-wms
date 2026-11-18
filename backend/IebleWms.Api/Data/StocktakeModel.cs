using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class StocktakeModel
{
 public static void Configure(ModelBuilder b)
 {
  var d=b.Entity<Stocktake>();d.HasKey(x=>x.Id);d.HasAlternateKey(x=>new{x.TenantId,x.Id});d.Property(x=>x.Version).IsConcurrencyToken();
  d.HasIndex(x=>new{x.TenantId,x.Number}).IsUnique();d.HasIndex(x=>new{x.TenantId,x.RequestId}).IsUnique();d.HasIndex(x=>new{x.TenantId,x.BasisDate,x.Status});
  foreach(var p in new[]{"Number","RequestHash","Scope","Status"})d.Property<string>(p).HasMaxLength(64);
  foreach(var p in new[]{"Name","WarehouseName","ScopeLabel","ContactName"})d.Property<string>(p).HasMaxLength(200);d.Property(x=>x.Notes).HasMaxLength(2000);
  d.HasOne<Warehouse>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId}).OnDelete(DeleteBehavior.Restrict);
  d.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ConfirmedBy).OnDelete(DeleteBehavior.Restrict);
  d.ToTable("Stocktakes",t=>{t.HasCheckConstraint("CK_Stocktake_Status","\"Status\" IN ('Prepared','Counting','Counted','Reviewing','Confirmed','Cancelled')");t.HasCheckConstraint("CK_Stocktake_Scope","(\"Scope\" IN ('Warehouse','Selected') AND \"ScopeId\" IS NULL) OR (\"Scope\" IN ('Zone','Rack','Location') AND \"ScopeId\" IS NOT NULL)");});
  var l=b.Entity<StocktakeTarget>();l.HasKey(x=>x.Id);l.HasAlternateKey(x=>new{x.TenantId,x.StocktakeId,x.Id});l.HasIndex(x=>new{x.TenantId,x.StocktakeId,x.StockId}).IsUnique();
  l.HasOne<Stocktake>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StocktakeId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
  l.HasOne<StockBalance>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StockId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
  l.HasOne<Product>().WithMany().HasForeignKey(x=>new{x.TenantId,x.ProductId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
  l.HasOne<StorageLocation>().WithMany().HasForeignKey(x=>new{x.TenantId,x.WarehouseId,x.LocationId}).OnDelete(DeleteBehavior.Restrict);
  l.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.CountedBy).OnDelete(DeleteBehavior.Restrict);
  foreach(var p in new[]{"OriginalQuantity","OriginalReserved","BaselineQuantity","BaselineReserved","CountedQuantity"})l.Property(p).HasPrecision(18,3);
  foreach(var p in new[]{"ProductCode","ProductName","Unit","LocationCode","RackCode","LotNumber","SerialNumber","ObservedSerial"})l.Property<string>(p).HasMaxLength(200);l.Property(x=>x.Reason).HasMaxLength(500);
  l.ToTable("StocktakeTargets",t=>t.HasCheckConstraint("CK_StocktakeTarget_Quantity","\"OriginalQuantity\" >= 0 AND \"BaselineQuantity\" >= 0 AND (\"CountedQuantity\" IS NULL OR \"CountedQuantity\" >= 0)"));
  var c=b.Entity<StocktakeChange>();c.HasKey(x=>x.Id);c.HasIndex(x=>new{x.TenantId,x.StocktakeId,x.Id});c.Property(x=>x.Action).HasMaxLength(64);c.Property(x=>x.ActorName).HasMaxLength(200);
  c.HasOne<Stocktake>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StocktakeId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);
  c.HasOne<StocktakeTarget>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StocktakeId,x.TargetId}).HasPrincipalKey(x=>new{x.TenantId,x.StocktakeId,x.Id}).OnDelete(DeleteBehavior.Restrict);
  c.HasOne<ApplicationUser>().WithMany().HasForeignKey(x=>x.ActorId).OnDelete(DeleteBehavior.Restrict);
  var m=b.Entity<StockMovement>();m.HasOne<Stocktake>().WithMany().HasForeignKey(x=>new{x.TenantId,x.StocktakeId}).HasPrincipalKey(x=>new{x.TenantId,x.Id}).OnDelete(DeleteBehavior.Restrict);m.HasIndex(x=>new{x.TenantId,x.StockId,x.StocktakeId}).IsUnique();
 }
}
