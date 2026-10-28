using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace IebleWms.Api.Data;

public static class DataServiceCollectionExtensions
{
    public static IServiceCollection AddWmsData(this IServiceCollection services, IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddScoped<IAuditActor, SystemAuditActor>();
        services.AddDbContext<WmsDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection")));
        services.AddIdentityCore<ApplicationUser>(options => options.User.RequireUniqueEmail = true)
            .AddEntityFrameworkStores<WmsDbContext>();
        services.AddScoped<MembershipAccessService>();
        return services;
    }
}
