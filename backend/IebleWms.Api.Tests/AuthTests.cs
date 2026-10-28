using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class AuthTests
{
    // Generated test-only credentials, never persisted outside an isolated test database.
    private static string Password() => "Test!Aa9" + Guid.NewGuid().ToString("N");
    private static object Registration(string password, string email = "owner@example.test", string number = "123-45-67890") => new
    {
        companyName = "테스트 기업", businessRegistrationNumber = number, contactName = "담당자",
        contactPhone = "010-1234-5678", email, password, systemRole = "IebleAdministrator", role = "Administrator", billingStatus = "Paid"
    };
    internal static async Task<HttpResponseMessage> Post(HttpClient client, string path, object body)
    {
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf");
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        return await client.SendAsync(request);
    }
    private static Task<HttpResponseMessage> Login(HttpClient client, string password, string email = "owner@example.test") =>
        Post(client, "/api/auth/login", new { email, password });

    [Fact]
    public async Task RegistrationCreatesMasterAtomicallyAndCannotCreatePlatformAdministrator()
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var password = Password();
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/auth/register", Registration(password))).StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var user = await db.Users.SingleAsync(); var tenant = await db.Tenants.SingleAsync();
        Assert.Equal(SystemRole.None, user.SystemRole);
        Assert.Equal(TenantRole.Master, (await db.TenantMemberships.SingleAsync()).Role);
        Assert.Equal("1234567890", tenant.BusinessRegistrationNumber);
        Assert.Equal(TenantServiceStatus.Active, tenant.ServiceStatus);
        Assert.Equal(TenantBillingStatus.CardRequired, tenant.BillingStatus);
        Assert.Equal("010-1234-5678", user.PhoneNumber);
        Assert.NotEqual(password, user.PasswordHash);
        Assert.True(await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().CheckPasswordAsync(user, password));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task DuplicateEmailAndBusinessNumberReturnConflictWithoutPartialRows()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/auth/register", Registration(password))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "/api/auth/register", Registration(password, "OWNER@example.test", "9876543210"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "/api/auth/register", Registration(password, "other@example.test", "1234567890"))).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1, await db.Users.CountAsync()); Assert.Equal(1, await db.Tenants.CountAsync()); Assert.Equal(1, await db.TenantMemberships.CountAsync());
    }

    [Fact]
    public async Task FailureAfterIdentityCreationRollsBackUserTenantAndMembership()
    {
        using var factory = new AuthFactory(failMembership: true); using var client = factory.Client();
        Assert.Equal(HttpStatusCode.InternalServerError, (await Post(client, "/api/auth/register", Registration(Password()))).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(0, await db.Users.CountAsync()); Assert.Equal(0, await db.Tenants.CountAsync()); Assert.Equal(0, await db.TenantMemberships.CountAsync());
    }

    [Theory]
    [InlineData("short", "1234567890", "Company")]
    [InlineData("LongEnoughButNoDigit!", "invalid", "Company")]
    [InlineData("ValidLengthAa1!", "1234567890", "   ")]
    public async Task InvalidRegistrationIsRejected(string password, string number, string company)
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        var response = await Post(client, "/api/auth/register", new { companyName = company, businessRegistrationNumber = number,
            contactName = "Owner", contactPhone = "010-0000-0000", email = "owner@example.test", password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.ToListAsync());
    }

    [Fact]
    public async Task CsrfIsRequiredForAnonymousAndAuthenticatedMutations()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", Registration(password))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/login", new { email = "owner@example.test", password })).StatusCode);
        await Post(client, "/api/auth/register", Registration(password)); await Login(client, password);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/select-tenant", new { tenantId = Guid.NewGuid() })).StatusCode);
        using var invalid = new HttpRequestMessage(HttpMethod.Post, "/api/auth/logout") { Content = JsonContent.Create(new { }) };
        invalid.Headers.Add("X-CSRF-TOKEN", "invalid");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(invalid)).StatusCode);
    }

    [Fact]
    public async Task DevelopmentHttpSupportsCsrfSignupLoginAndLogoutWithoutSecureCookie()
    {
        using var factory = new AuthFactory(); using var initialized = factory.Client();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost"), AllowAutoRedirect = false });
        var csrf = await client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, csrf.StatusCode);
        var csrfCookie = csrf.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.csrf="));
        Assert.Contains("httponly", csrfCookie.ToLowerInvariant()); Assert.Contains("samesite=strict", csrfCookie.ToLowerInvariant());
        Assert.DoesNotContain("; secure", csrfCookie.ToLowerInvariant());
        var password = Password();
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/auth/register", Registration(password))).StatusCode);
        var login = await Login(client, password);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var sessionCookie = login.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.session="));
        Assert.Contains("httponly", sessionCookie.ToLowerInvariant()); Assert.Contains("samesite=strict", sessionCookie.ToLowerInvariant());
        Assert.DoesNotContain("; secure", sessionCookie.ToLowerInvariant());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(client, "/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ProductionCookiesAreSecureHttpOnlyAndLogoutRevokesCopiedSession()
    {
        using var factory = new AuthFactory(production: true); using var client = factory.Client(); var password = Password();
        await Post(client, "/api/auth/register", Registration(password));
        var login = await Login(client, password, "OWNER@example.test");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("__Host-ieble.session="));
        Assert.Contains("httponly", cookie.ToLowerInvariant()); Assert.Contains("secure", cookie.ToLowerInvariant()); Assert.Contains("samesite=strict", cookie.ToLowerInvariant());
        Assert.DoesNotContain("expires=", cookie.ToLowerInvariant());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Post(client, "/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        using var replay = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task RepeatedLoginFailureLocksAccountAndIpRateLimitReturns429()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        await Post(client, "/api/auth/register", Registration(password));
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, Password())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, password)).StatusCode);
        using var scope = factory.Services.CreateScope(); var user = await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.SingleAsync();
        Assert.True(user.LockoutEnd > DateTimeOffset.UtcNow);
        for (var i = 0; i < 4; i++) await Login(client, Password());
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(client, password)).StatusCode);
    }

    [Fact]
    public async Task TenantSelectionAndWorkspaceRejectForeignTenantAndUseCurrentMembership()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        await Post(client, "/api/auth/register", Registration(password));
        Guid first; Guid second; Guid foreign;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var user = await db.Users.SingleAsync();
            first = (await db.Tenants.SingleAsync()).Id;
            var b = new Tenant { Code = "SECOND", Name = "두 번째" }; var c = new Tenant { Code = "FOREIGN", Name = "다른 기업" };
            db.Add(new TenantMembership { UserId = user.Id, Tenant = b, Role = TenantRole.Employee }); db.Add(c); await db.SaveChangesAsync();
            second = b.Id; foreign = c.Id;
        }
        await Login(client, password);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(2, me.GetProperty("memberships").GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tenants/{first}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(client, "/api/auth/select-tenant", new { tenantId = foreign })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post(client, "/api/auth/select-tenant", new { tenantId = first })).StatusCode);
        Assert.Equal("Master", (await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{first}/workspace")).GetProperty("role").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{second}/workspace")).StatusCode);
        await Post(client, "/api/auth/select-tenant", new { tenantId = second });
        Assert.Equal("Employee", (await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{second}/workspace")).GetProperty("role").GetString());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.TenantMemberships.SingleAsync(x => x.TenantId == second)).IsActive = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{second}/workspace")).StatusCode);
        Assert.Equal(first.ToString(), (await client.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("selectedTenantId").GetString());
    }

    [Theory]
    [InlineData(TenantRole.Master, true)]
    [InlineData(TenantRole.Administrator, true)]
    [InlineData(TenantRole.Employee, false)]
    public async Task TenantManagerPolicyDistinguishesRolesAndActivationIsSeparate(TenantRole role, bool canManage)
    {
        using var factory = new AuthFactory(); using var client = factory.Client();
        await Post(client, "/api/auth/register", Registration(Password()));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var membership = await db.TenantMemberships.Include(x => x.User).Include(x => x.Tenant).SingleAsync();
        membership.Role = role; await db.SaveChangesAsync();
        var principal = await scope.ServiceProvider.GetRequiredService<IUserClaimsPrincipalFactory<ApplicationUser>>().CreateAsync(membership.User);
        ((System.Security.Claims.ClaimsIdentity)principal.Identity!).AddClaim(new System.Security.Claims.Claim(IebleWms.Api.Auth.AuthConfiguration.TenantClaim, membership.TenantId.ToString()));
        var http = new Microsoft.AspNetCore.Http.DefaultHttpContext { User = principal };
        http.Request.RouteValues["tenantId"] = membership.TenantId;
        scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>().HttpContext = http;
        var authorization = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Authorization.IAuthorizationService>();
        Assert.Equal(canManage, (await authorization.AuthorizeAsync(principal, null, "TenantAdministrator")).Succeeded);
        Assert.False((await authorization.AuthorizeAsync(principal, null, "ActiveTenant")).Succeeded);
        membership.Tenant.ServiceStatus = TenantServiceStatus.Active; membership.Tenant.BillingStatus = TenantBillingStatus.Paid; await db.SaveChangesAsync();
        Assert.True((await authorization.AuthorizeAsync(principal, null, "ActiveTenant")).Succeeded);
        membership.Tenant.IsActive = false; await db.SaveChangesAsync();
        Assert.False((await authorization.AuthorizeAsync(principal, null, "TenantMember")).Succeeded);
    }

    [Fact]
    public async Task PlatformRoleIsCheckedFromDatabaseAndDisabledUsersLoseExistingSession()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var password = Password();
        Guid tenant;
        using (var scope = factory.Services.CreateScope())
        {
            var manager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.True((await manager.CreateAsync(new ApplicationUser { UserName = "support@example.test", Email = "support@example.test", DisplayName = "Support", SystemRole = SystemRole.IebleAdministrator }, password)).Succeeded);
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var t = new Tenant { Code = "FOREIGN", Name = "다른 기업" }; db.Add(t); await db.SaveChangesAsync(); tenant = t.Id;
        }
        await Login(client, password, "support@example.test");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(client, "/api/auth/select-tenant", new { tenantId = tenant })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.Users.SingleAsync()).SystemRole = SystemRole.None; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/overview")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); (await db.Users.SingleAsync()).IsActive = false; await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client, password, "support@example.test")).StatusCode);
    }
}

internal sealed class AuthFactory(bool failMembership = false, bool production = false, bool failBootstrap = false, bool staleStatusWrite = false, TimeProvider? clock = null, bool resetTokens = false) : WebApplicationFactory<Program>
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(production ? "Production" : "Development");
        builder.ConfigureServices(services =>
        {
            connection.Open();
            if (resetTokens) services.AddIdentityCore<ApplicationUser>().AddDefaultTokenProviders();
            if (clock is not null) services.AddSingleton<TimeProvider>(clock);
            services.RemoveAll<DbContextOptions<WmsDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<WmsDbContext>>();
            services.RemoveAll<WmsDbContext>();
            services.AddDbContext<WmsDbContext>(options =>
            {
                options.UseSqlite(connection).ReplaceService<IModelCustomizer, SqliteTimestampModelCustomizer>();
                if (failMembership) options.AddInterceptors(new FailMembershipInterceptor());
                if (failBootstrap || staleStatusWrite) options.AddInterceptors(new AdministrativeFailureInterceptor(failBootstrap, staleStatusWrite));
            });
        });
    }
    public HttpClient Client()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        using var scope = Services.CreateScope(); scope.ServiceProvider.GetRequiredService<WmsDbContext>().Database.EnsureCreated();
        return client;
    }
    protected override void Dispose(bool disposing) { base.Dispose(disposing); if (disposing) connection.Dispose(); }
    private sealed class AdministrativeFailureInterceptor(bool failBootstrap, bool staleStatusWrite) : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = eventData.Context!;
            if (failBootstrap && db.ChangeTracker.Entries<AdministratorBootstrap>().Any(x => x.State == EntityState.Added))
                throw new DbUpdateException("Simulated receipt failure");
            if (staleStatusWrite && db.ChangeTracker.Entries<TenantStatusChange>().Any(x => x.State == EntityState.Added))
                foreach (var tenant in db.ChangeTracker.Entries<Tenant>().Where(x => x.State == EntityState.Modified))
                    tenant.Property(x => x.Version).OriginalValue = Guid.NewGuid();
            return ValueTask.FromResult(result);
        }
    }
    private sealed class FailMembershipInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<TenantMembership>().Any(x => x.State == EntityState.Added))
                throw new InvalidOperationException("Simulated persistence failure");
            return ValueTask.FromResult(result);
        }
    }
}
