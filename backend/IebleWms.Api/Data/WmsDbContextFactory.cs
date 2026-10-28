using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace IebleWms.Api.Data;

// Model/migration generation needs the provider, not a database or credentials.
public sealed class WmsDbContextFactory : IDesignTimeDbContextFactory<WmsDbContext>
{
    public WmsDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<WmsDbContext>().UseNpgsql().Options;
        return new WmsDbContext(options, new SystemAuditActor(), TimeProvider.System);
    }
}
