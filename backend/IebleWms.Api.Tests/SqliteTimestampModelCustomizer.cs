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
        modelBuilder.Entity<TenantStatusChange>().Property(x => x.ChangedAt)
            .HasConversion(value => value.UtcTicks, value => new DateTimeOffset(value, TimeSpan.Zero));
    }
}
