using System.Security.Claims;
using System.Threading.RateLimiting;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Auth;

public static class AuthConfiguration
{
    public const string TenantClaim = "ieble:tenant";
    public static IServiceCollection AddWmsAuthentication(this IServiceCollection services, IHostEnvironment environment)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<IAuditActor, HttpAuditActor>();
        services.AddScoped<CompanyRegistrationService>();
        services.AddScoped<TenantSessionService>();
        services.AddScoped<IebleWms.Api.Administration.BootstrapAdminService>();
        services.AddScoped<IebleWms.Api.Administration.TenantAdministrationService>();
        services.AddScoped<IAuthorizationHandler, WmsAuthorizationHandler>();
        services.AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddCookie(IdentityConstants.ApplicationScheme, options =>
            {
                options.Cookie.Name = environment.IsDevelopment() ? "ieble.session" : "__Host-ieble.session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                options.Cookie.Path = "/";
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.SlidingExpiration = false;
                options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
                options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
                // Check revocation/disabled accounts on every request, not only on periodic renewal.
                options.Events.OnValidatePrincipal = async context =>
                {
                    var manager = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                    var user = await manager.GetUserAsync(context.Principal!);
                    var stamp = context.Principal?.FindFirstValue(manager.Options.ClaimsIdentity.SecurityStampClaimType);
                    if (user is null || !user.IsActive || stamp != user.SecurityStamp)
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
                    }
                };
            });
        services.AddOptions<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme)
            .Configure<TimeProvider>((options, clock) => options.TimeProvider = clock);
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = environment.IsDevelopment() ? "ieble.csrf" : "__Host-ieble.csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.Cookie.Path = "/";
        });
        services.AddScoped<ApiAntiforgeryFilter>();
        services.Configure<MvcOptions>(options => options.Filters.AddService<ApiAntiforgeryFilter>());
        services.AddAuthorization(options =>
        {
            options.AddPolicy("IebleAdministrator", policy => policy.RequireAuthenticatedUser().AddRequirements(new WmsAccessRequirement("platform")));
            options.AddPolicy("TenantMember", policy => policy.RequireAuthenticatedUser().AddRequirements(new WmsAccessRequirement("member")));
            options.AddPolicy("TenantAdministrator", policy => policy.RequireAuthenticatedUser().AddRequirements(new WmsAccessRequirement("manager")));
            options.AddPolicy("ActiveTenant", policy => policy.RequireAuthenticatedUser().AddRequirements(new WmsAccessRequirement("active")));
        });
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.OnRejected = async (context, token) =>
            {
                context.HttpContext.Response.Headers.RetryAfter = "60";
                await context.HttpContext.Response.WriteAsJsonAsync(new { message = "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, token);
            };
            foreach (var (name, limit) in new[] { ("login", 10), ("register", 3) })
                options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }
}

internal sealed class HttpAuditActor(IHttpContextAccessor accessor) : IAuditActor
{
    public Guid? UserId => Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}

public sealed record WmsAccessRequirement(string Scope) : IAuthorizationRequirement;

internal sealed class WmsAuthorizationHandler(WmsDbContext db, MembershipAccessService access, IHttpContextAccessor accessor, IebleWms.Api.Billing.BillingAccessService billing)
    : AuthorizationHandler<WmsAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, WmsAccessRequirement requirement)
    {
        if (!Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return;
        if (requirement.Scope == "platform")
        {
            if (await access.IsIebleAdministratorAsync(userId)) context.Succeed(requirement);
            return;
        }
        var request = accessor.HttpContext;
        if (!Guid.TryParse(request?.Request.RouteValues["tenantId"]?.ToString(), out var tenantId) ||
            !Guid.TryParse(context.User.FindFirstValue(AuthConfiguration.TenantClaim), out var selected) || selected != tenantId) return;
        var role = await access.GetTenantRoleAsync(userId, tenantId);
        if (role is null) return;
        if (requirement.Scope == "manager" && role is not (TenantRole.Master or TenantRole.Administrator)) return;
        if (requirement.Scope == "active")
        {
            var tenant = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == tenantId);
            if (tenant is null || !billing.Evaluate(tenant).CanAccessWms) return;
        }
        context.Succeed(requirement);
    }
}
