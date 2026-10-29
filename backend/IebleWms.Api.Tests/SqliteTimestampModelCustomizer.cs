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
        // SQLite has no native timestamptz ordering; PostgreSQL remains the production provider.
        var utcTicks = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTimeOffset, long>(v => v.UtcTicks, v => new DateTimeOffset(v, TimeSpan.Zero));
        modelBuilder.Entity<TenantMembership>().Property(x => x.BillingStartsAt).HasConversion(utcTicks);
        modelBuilder.Entity<TenantMembership>().Property(x => x.BillingEndsAt).HasConversion(utcTicks);
        modelBuilder.Entity<BillingInvoice>().Property(x => x.CycleStart).HasConversion(utcTicks);
        modelBuilder.Entity<BillingInvoice>().Property(x => x.CycleEnd).HasConversion(utcTicks);
        modelBuilder.Entity<BillingFeedback>().Property(x => x.CreatedAt).HasConversion(utcTicks);
        modelBuilder.Entity<TenantStatusChange>().Property(x => x.ChangedAt)
            .HasConversion(value => value.UtcTicks, value => new DateTimeOffset(value, TimeSpan.Zero));
    }
}
