using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace IebleWms.Api.Hosting;

public static class DeploymentConfiguration
{
    // Opt in only to operator-specified proxy addresses; never trust arbitrary forwarded headers.
    public static IServiceCollection AddWmsDeployment(this IServiceCollection services, IConfiguration configuration)
    {
        var addresses = configuration.GetSection("Deployment:KnownProxies").Get<string[]>() ?? [];
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            if (addresses.Length == 0) return;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var text in addresses)
            {
                if (!IPAddress.TryParse(text, out var address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
                    throw new InvalidOperationException("Deployment:KnownProxies에는 신뢰할 프록시의 개별 IP 주소를 지정해야 합니다.");
                options.KnownProxies.Add(address);
            }
            options.ForwardLimit = 1;
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        });
        return services;
    }
}
