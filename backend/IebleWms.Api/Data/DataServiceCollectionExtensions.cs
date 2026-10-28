using Microsoft.AspNetCore.Identity;
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
        services.AddIdentityCore<ApplicationUser>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Password.RequiredLength = 12;
            options.Password.RequireUppercase = false;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.AllowedForNewUsers = true;
        })
            .AddEntityFrameworkStores<WmsDbContext>()
            .AddSignInManager();
        services.AddScoped<MembershipAccessService>();
        return services;
    }
}
