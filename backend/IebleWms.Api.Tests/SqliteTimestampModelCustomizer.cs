using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace IebleWms.Api.Tests;

// SQLite cannot ORDER BY DateTimeOffset natively. Preserve UTC tick precision in HTTP tests;
// PostgreSQL uses its native timestamp with time zone mapping in production.
public sealed class SqliteTimestampModelCustomizer(ModelCustomizerDependencies dependencies) : ModelCustomizer(dependencies)
{
    public override void Customize(ModelBuilder modelBuilder, DbContext context)
    {
        base.Customize(modelBuilder, context);
        // SQLite stores EF decimals as TEXT. Compare numerically in the test
        // constraint (otherwise "3.0" > "10.0"); PostgreSQL uses native numeric.
        modelBuilder.Entity<StockBalance>().ToTable("StockBalances", t => t.HasCheckConstraint("CK_Stock_Quantity",
            "CAST(\"Quantity\" AS REAL) >= 0 AND CAST(\"ReservedQuantity\" AS REAL) >= 0 AND CAST(\"ReservedQuantity\" AS REAL) <= CAST(\"Quantity\" AS REAL)"));
        modelBuilder.Entity<ShipmentAllocation>().ToTable("ShipmentAllocations", t => t.HasCheckConstraint("CK_Allocation_Quantity",
            "CAST(\"Quantity\" AS REAL) > 0 AND CAST(\"PickedQuantity\" AS REAL) >= 0 AND CAST(\"PickedQuantity\" AS REAL) <= CAST(\"Quantity\" AS REAL) AND CAST(\"InspectedQuantity\" AS REAL) >= 0 AND CAST(\"InspectedQuantity\" AS REAL) <= CAST(\"PickedQuantity\" AS REAL)"));
        // SQLite has no native timestamptz ordering; PostgreSQL remains the production provider.
        var utcTicks = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTimeOffset, long>(v => v.UtcTicks, v => new DateTimeOffset(v, TimeSpan.Zero));
        modelBuilder.Entity<ExternalAccountLink>().Property(x=>x.CreatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<ExternalAccountLink>().Property(x=>x.ExpiresAt).HasConversion(utcTicks);
        modelBuilder.Entity<ExternalAccountLink>().Property(x=>x.OwnerApprovedAt).HasConversion(utcTicks);
        modelBuilder.Entity<LabelDesign>().Property(x=>x.UpdatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<WarehouseTemplate>().Property(x=>x.CreatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<WarehouseTemplate>().Property(x=>x.UpdatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<TenantMembership>().Property(x => x.BillingStartsAt).HasConversion(utcTicks);
        modelBuilder.Entity<TenantMembership>().Property(x => x.BillingEndsAt).HasConversion(utcTicks);
        modelBuilder.Entity<BillingInvoice>().Property(x => x.CycleStart).HasConversion(utcTicks);
        modelBuilder.Entity<BillingInvoice>().Property(x => x.CycleEnd).HasConversion(utcTicks);
        modelBuilder.Entity<BillingFeedback>().Property(x => x.CreatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<Tenant>().Property(x => x.CreatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<TenantStatusChange>().Property(x => x.ChangedAt)
            .HasConversion(value => value.UtcTicks, value => new DateTimeOffset(value, TimeSpan.Zero));
    }
}
