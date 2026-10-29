using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Billing;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class OrganizationTests
{
    private sealed record Fixture(Guid TenantId, Guid ForeignId, Guid Master, Guid Admin, Guid Employee, string Password);
    private static async Task<Fixture> Seed(AuthFactory factory)
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var tenant = new Tenant { Code = "ORG", Name = "조직 기업", BusinessRegistrationNumber = "1234567890", ContactName = "기존 담당자", ContactPhone = "010-1234-5678", BillingStatus = TenantBillingStatus.Paid };
        var foreign = new Tenant { Code = "OTHER", Name = "다른 기업", BusinessRegistrationNumber = "9876543210", BillingStatus = TenantBillingStatus.Paid };
        var password = "lower1!" + Guid.NewGuid().ToString("N"); var ids = new List<Guid>();
        foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee })
        {
            var user = new ApplicationUser { Email = $"{role}@org.test", UserName = $"{role}@org.test", DisplayName = role.ToString() };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            db.Add(new TenantMembership { Tenant = tenant, User = user, Role = role }); ids.Add(user.Id);
        }
        db.Add(foreign); await db.SaveChangesAsync(); return new(tenant.Id, foreign.Id, ids[0], ids[1], ids[2], password);
    }
    private static async Task Login(HttpClient client, string id, string password, bool rememberMe = false) =>
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = id, password, rememberMe })).StatusCode);
    private static async Task<JsonElement> Json(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>();
    private static object Create(string id = "staff01", string email = "staff01@org.test", string role = "Employee") => new { name = "신규 직원", loginId = id, email, role };
    private static async Task<JsonElement> CreateStaff(HttpClient master, Guid tenant, string id = "staff01", string email = "staff01@org.test", string role = "Employee")
    {
        var response = await AuthTests.Post(master, $"/api/tenants/{tenant}/users", Create(id, email, role));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await Json(response);
    }
    private static string Cookie(HttpResponseMessage response) => response.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.session=")).Split(';')[0];
    private static HttpClient Replay(AuthFactory factory, string cookie)
    {
        var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        client.DefaultRequestHeaders.Add("Cookie", cookie); return client;
    }

    [Theory]
    [InlineData("Master", true)]
    [InlineData("Administrator", true)]
    [InlineData("Employee", false)]
    public async Task CompanyReadWriteAndBusinessNumberChangesEnforcePermissionsAndTenant(string role, bool allowed)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, $"{role}@org.test", f.Password);
        var endpoint = $"/api/tenants/{f.TenantId}/company";
        var response = await client.GetAsync(endpoint);
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, response.StatusCode);
        Guid version;
        using (var scope = factory.Services.CreateScope()) version = (await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Tenants.FindAsync(f.TenantId))!.Version;
        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await AuthTests.Post(client, endpoint, new {
            version, name = "변경 기업", representativeName = "대표", address = "서울시", contactName = "담당자", contactPhone = "02-123-4567"
        })).StatusCode);
        if (allowed) version = (await client.GetFromJsonAsync<JsonElement>(endpoint)).GetProperty("company").GetProperty("version").GetGuid();
        Assert.Equal(role == "Master" ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await AuthTests.Post(client, endpoint + "/business-number", new {
            version, businessRegistrationNumber = " 111 - 22 - 33333 ", reason = "사업자번호 정정"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/tenants/{f.ForeignId}/company")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(client, $"/api/tenants/{f.ForeignId}/company", new { version, name = "공격" })).StatusCode);
        using var verify = factory.Services.CreateScope(); var db = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal("다른 기업", (await db.Tenants.FindAsync(f.ForeignId))!.Name);
        if (role == "Master")
        {
            var change = await db.OrganizationChanges.SingleAsync(x => x.Action == "BusinessNumberChanged");
            Assert.Equal(f.Master, change.ChangedByUserId); Assert.Contains("1234567890", change.BeforeJson); Assert.Contains("1112233333", change.AfterJson);
            Assert.Equal("사업자번호 정정", change.Reason);
        }
    }

    [Fact]
    public async Task CompanyHistoryShowsActorAndChangesWithoutLeakingOtherTenantsOrCredentialEvents()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory);
        await Login(client, "Master@org.test", f.Password);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            (await db.TenantMemberships.SingleAsync(x => x.UserId == f.Master)).DisplayName = "기업 담당 마스터";
            db.OrganizationChanges.AddRange(
                new OrganizationChange { TenantId = f.ForeignId, ChangedByUserId = f.Master, Action = "CompanyUpdated", BeforeJson = "{}", AfterJson = "{}", ChangedAt = DateTimeOffset.UtcNow },
                new OrganizationChange { TenantId = f.TenantId, ChangedByUserId = f.Master, TargetUserId = f.Master, Action = "PasswordChanged", BeforeJson = "{}", AfterJson = "{}", ChangedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        var endpoint = $"/api/tenants/{f.TenantId}/company";
        var before = (await client.GetFromJsonAsync<JsonElement>(endpoint)).GetProperty("company");
        var request = new { version = before.GetProperty("version").GetGuid(), name = "이력 검증 기업", representativeName = "새 대표", address = "서울시 검증로", contactName = "담당자", contactPhone = "02-123-4567" };
        var updated = await AuthTests.Post(client, endpoint, request); Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var saved = await Json(updated);
        // A repeated no-op must not add history or update the concurrency token.
        var noop = await AuthTests.Post(client, endpoint, new { version = saved.GetProperty("version").GetGuid(), request.name, request.representativeName, request.address, request.contactName, request.contactPhone });
        Assert.Equal(HttpStatusCode.OK, noop.StatusCode);
        Assert.Equal(saved.GetProperty("version").GetGuid(), (await Json(noop)).GetProperty("version").GetGuid());
        var result = await client.GetFromJsonAsync<JsonElement>(endpoint);
        var row = Assert.Single(result.GetProperty("history").EnumerateArray());
        Assert.Equal("CompanyUpdated", row.GetProperty("action").GetString()); Assert.Equal(f.Master, row.GetProperty("changedByUserId").GetGuid());
        Assert.Equal("기업 담당 마스터", row.GetProperty("changedByName").GetString());
        Assert.Contains("이력 검증 기업", JsonDocument.Parse(row.GetProperty("afterJson").GetString()!).RootElement.GetProperty("Name").GetString());
        Assert.DoesNotContain("PasswordChanged", result.ToString()); Assert.Empty(result.GetProperty("businessNumberHistory").EnumerateArray());
        using var check = factory.Services.CreateScope(); var verify = check.ServiceProvider.GetRequiredService<WmsDbContext>();
        var tenant = (await verify.Tenants.FindAsync(f.TenantId))!;
        Assert.Equal(f.Master, tenant.UpdatedByUserId); Assert.Equal(tenant.UpdatedAt, row.GetProperty("changedAt").GetDateTimeOffset(), TimeSpan.FromSeconds(1));
        Assert.Equal(1, await verify.OrganizationChanges.CountAsync(x => x.TenantId == f.TenantId && x.Action == "CompanyUpdated"));
    }

    [Fact]
    public async Task CompanyRejectsDuplicatesStaleWritesAndOverpostingAndUsesSignupContact()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, "Master@org.test", f.Password);
        var endpoint = $"/api/tenants/{f.TenantId}/company"; var company = (await client.GetFromJsonAsync<JsonElement>(endpoint)).GetProperty("company");
        Assert.Equal("기존 담당자", company.GetProperty("contactName").GetString()); var version = company.GetProperty("version").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(client, endpoint + "/business-number", new { version, businessRegistrationNumber = "987-65-43210", reason = "중복" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(client, endpoint, new { version, name = "변경", businessRegistrationNumber = "1112233333" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, endpoint, new { version, name = "새 이름" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(client, endpoint, new { version, name = "오래된 입력" })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(1, await db.OrganizationChanges.CountAsync()); Assert.Equal("1234567890", (await db.Tenants.FindAsync(f.TenantId))!.BusinessRegistrationNumber);
        var log = await db.OrganizationChanges.SingleAsync(); db.Remove(log); await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [Theory]
    [InlineData("Master", true)]
    [InlineData("Administrator", true)]
    [InlineData("Employee", false)]
    public async Task OnlyMasterOrAuthorizedAdministratorCanCreateStaff(string role, bool allowed)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, $"{role}@org.test", f.Password);
        // Even an employee granted every user-management action cannot create accounts.
        if (role == "Employee")
        {
            using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var grants = PermissionCatalog.Defaults(); grants["Employee"]["users"] = PermissionCatalog.Features.Single(x => x.Key == "users").Actions;
            db.Add(new TenantPermissionSettings { TenantId = f.TenantId, RolesJson = JsonSerializer.Serialize(grants), Version = Guid.NewGuid(), UpdatedByUserId = f.Master }); await db.SaveChangesAsync();
        }
        Assert.Equal(allowed ? HttpStatusCode.Created : HttpStatusCode.Forbidden, (await AuthTests.Post(client, $"/api/tenants/{f.TenantId}/users", Create())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(client, $"/api/tenants/{f.ForeignId}/users", Create("foreign", "foreign@org.test"))).StatusCode);
    }

    [Fact]
    public async Task InitialPasswordMatchesLoginIdIsHashedAndBillingDatesAreRecorded()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, "Master@org.test", f.Password);
        var first = await CreateStaff(client, f.TenantId); var second = await CreateStaff(client, f.TenantId, "staff02", "staff02@org.test", "Administrator");
        var initialPassword = first.GetProperty("user").GetProperty("loginId").GetString()!;
        Assert.Equal("staff01", initialPassword);
        Assert.False(first.TryGetProperty("temporaryPassword", out _)); Assert.False(first.TryGetProperty("initialPassword", out _));
        Assert.Equal("staff02", second.GetProperty("user").GetProperty("loginId").GetString());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByNameAsync("staff01"))!;
        Assert.True(user.MustChangePassword); Assert.NotEqual(initialPassword, user.PasswordHash); Assert.True(await users.CheckPasswordAsync(user, initialPassword));
        var membership = await db.TenantMemberships.SingleAsync(x => x.UserId == user.Id);
        Assert.Equal(f.TenantId, membership.TenantId); Assert.True(membership.IsDefault); Assert.Null(membership.BillingEndsAt);
        Assert.Equal(scope.ServiceProvider.GetRequiredService<BillingAccessService>().FirstMemberChargeAt(membership), membership.BillingStartsAt);
        var list = await client.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/users");
        Assert.DoesNotContain("temporaryPassword", list.ToString()); Assert.DoesNotContain("passwordHash", list.ToString()); Assert.DoesNotContain("securityStamp", list.ToString());
        var audit = await db.OrganizationChanges.ToListAsync();
        Assert.All(audit, x => { Assert.DoesNotContain(initialPassword, x.BeforeJson + x.AfterJson); Assert.DoesNotContain(user.PasswordHash!, x.BeforeJson + x.AfterJson); });
    }

    [Theory]
    [InlineData("ieble001")]
    [InlineData("abc")]
    [InlineData("Mixed_Staff123")]
    public async Task OnlyExplicitStaffInitialPasswordPathCanUseLoginId(string loginId)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, "Master@org.test", f.Password);
        var response = await CreateStaff(client, f.TenantId, loginId, "initial@org.test");
        Assert.True(response.GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        using var scope = factory.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByNameAsync(loginId))!;
        Assert.True(await users.CheckPasswordAsync(user, loginId)); Assert.NotEqual(loginId, user.PasswordHash);
        Assert.Equal(8, users.Options.Password.RequiredLength); Assert.True(users.Options.Password.RequireLowercase);
        Assert.True(users.Options.Password.RequireDigit); Assert.True(users.Options.Password.RequireNonAlphanumeric); Assert.False(users.Options.Password.RequireUppercase);
        // Normal Identity operations still enforce all existing requirements and disallow the login ID.
        var normalUser = new ApplicationUser { UserName = loginId + "_normal", Email = "normal@org.test", DisplayName = "일반 계정" };
        Assert.False((await users.CreateAsync(normalUser, normalUser.UserName)).Succeeded);
        Assert.False((await users.ChangePasswordAsync(user, loginId, loginId.ToUpperInvariant())).Succeeded);
        var resetToken = await users.GeneratePasswordResetTokenAsync(user);
        var rejected = await users.ResetPasswordAsync(user, resetToken, loginId);
        Assert.False(rejected.Succeeded); Assert.Contains(rejected.Errors, x => x.Code == "PasswordMatchesLoginId");
    }

    [Fact]
    public async Task PersonalPasswordCannotReturnToInitialLoginIdEvenAfterFirstChange()
    {
        const string loginId = "initial_staff123";
        using var factory = new AuthFactory(); using var master = factory.Client(); using var staff = factory.Client(); var f = await Seed(factory);
        await Login(master, "Master@org.test", f.Password); await CreateStaff(master, f.TenantId, loginId, "personal@org.test"); await Login(staff, loginId, loginId);
        foreach (var candidate in new[] { loginId, loginId.ToUpperInvariant() })
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = loginId, newPassword = candidate, confirmPassword = candidate })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = loginId, newPassword = "personalpass123!", confirmPassword = "personalpass123!" })).StatusCode);
        foreach (var candidate in new[] { loginId, loginId.ToUpperInvariant() })
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = "personalpass123!", newPassword = candidate, confirmPassword = candidate })).StatusCode);
        Assert.False((await staff.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        await Login(staff, loginId, "personalpass123!");
    }

    [Fact]
    public async Task InitialCredentialsKeepLockoutAndCsrfAndDoNotRewriteExistingAccounts()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var staff = factory.Client(); var f = await Seed(factory);
        Dictionary<Guid, string?> hashes;
        using (var scope = factory.Services.CreateScope()) hashes = await scope.ServiceProvider.GetRequiredService<WmsDbContext>().Users.ToDictionaryAsync(x => x.Id, x => x.PasswordHash);
        await Login(master, "Master@org.test", f.Password);
        Assert.Equal(HttpStatusCode.BadRequest, (await master.PostAsJsonAsync($"/api/tenants/{f.TenantId}/users", Create())).StatusCode);
        await CreateStaff(master, f.TenantId, "ieble001", "lockout@org.test");
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(staff, "/api/auth/login", new { email = "ieble001", password = "incorrect" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(staff, "/api/auth/login", new { email = "ieble001", password = "ieble001" })).StatusCode);
        using var verify = factory.Services.CreateScope(); var users = verify.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True(await users.IsLockedOutAsync((await users.FindByNameAsync("ieble001"))!));
        var db = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        foreach (var existing in await db.Users.Where(x => x.Id == f.Master || x.Id == f.Admin || x.Id == f.Employee).ToListAsync())
        { Assert.Equal(hashes[existing.Id], existing.PasswordHash); Assert.False(existing.MustChangePassword); }
    }

    [Theory]
    [InlineData("duplicateId")]
    [InlineData("duplicateEmail")]
    [InlineData("masterRole")]
    [InlineData("shortId")]
    [InlineData("invalidEmail")]
    [InlineData("overposting")]
    public async Task InvalidOrDuplicateStaffRegistrationNeverCreatesPartialAccount(string kind)
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory); await Login(client, "Master@org.test", f.Password);
        await CreateStaff(client, f.TenantId);
        object request = kind switch {
            "duplicateId" => Create("STAFF01", "new@org.test"), "duplicateEmail" => Create("otherstaff", "STAFF01@ORG.TEST"),
            "masterRole" => Create("otherstaff", "new@org.test", "Master"), "shortId" => Create("ab", "new@org.test"),
            "invalidEmail" => Create("otherstaff", "invalid"), _ => new { name = "위조", loginId = "otherstaff", email = "new@org.test", role = "Employee", mustChangePassword = false, password = "chosen12345!" }
        };
        Assert.Equal(kind.StartsWith("duplicate") ? HttpStatusCode.Conflict : HttpStatusCode.BadRequest, (await AuthTests.Post(client, $"/api/tenants/{f.TenantId}/users", request)).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(4, await db.Users.CountAsync()); Assert.Equal(4, await db.TenantMemberships.CountAsync()); Assert.Equal(1, await db.OrganizationChanges.CountAsync());
    }

    [Fact]
    public async Task InitialLoginRequiresPasswordChangeAndRotatesOnlyCurrentSessionWithoutExtendingExpiry()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var staff = factory.Client(); var f = await Seed(factory); await Login(master, "Master@org.test", f.Password);
        var created = await CreateStaff(master, f.TenantId); var initialPassword = created.GetProperty("user").GetProperty("loginId").GetString()!;
        var login = await AuthTests.Post(staff, "/api/auth/login", new { email = "STAFF01", password = initialPassword, rememberMe = true });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode); var oldCookie = Cookie(login);
        var originalExpiry = Microsoft.Net.Http.Headers.SetCookieHeaderValue.Parse(login.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.session="))).Expires;
        Assert.True((await staff.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        foreach (var path in new[] { "workspace", "dashboard", "pages/products", "company", "users", "permissions" })
            Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync($"/api/tenants/{f.TenantId}/{path}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(staff, "/api/auth/default-tenant", new { tenantId = f.TenantId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = initialPassword, newPassword = "lowercase123!", confirmPassword = "different123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = "incorrect", newPassword = "lowercase123!", confirmPassword = "lowercase123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = initialPassword, newPassword = "lowercaseonly!", confirmPassword = "lowercaseonly!" })).StatusCode);
        Assert.True((await staff.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        var changed = await AuthTests.Post(staff, "/api/auth/change-password", new { currentPassword = initialPassword, newPassword = "lowercase123!", confirmPassword = "lowercase123!" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var newExpiry = Microsoft.Net.Http.Headers.SetCookieHeaderValue.Parse(changed.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("ieble.session="))).Expires;
        Assert.Equal(originalExpiry, newExpiry);
        using var copied = Replay(factory, oldCookie); Assert.Equal(HttpStatusCode.Unauthorized, (await copied.GetAsync("/api/auth/me")).StatusCode);
        Assert.False((await staff.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync($"/api/tenants/{f.TenantId}/dashboard")).StatusCode);
        await AuthTests.Post(staff, "/api/auth/logout", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(staff, "/api/auth/login", new { email = "staff01", password = initialPassword })).StatusCode);
        await Login(staff, "staff01@org.test", "lowercase123!");
    }

    [Fact]
    public async Task AdministratorResetRevokesSessionsProtectsMasterAndRecordsActorWithoutSecrets()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var admin = factory.Client(); using var staff = factory.Client(); var f = await Seed(factory);
        await Login(master, "Master@org.test", f.Password); await Login(admin, "Administrator@org.test", f.Password); await Login(staff, "Employee@org.test", f.Password);
        var list = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/users");
        var target = list.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == f.Employee);
        var response = await AuthTests.Post(admin, $"/api/tenants/{f.TenantId}/users/{f.Employee}/reset-password", new { version = target.GetProperty("version").GetGuid() });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); var initialPassword = (await Json(response)).GetProperty("user").GetProperty("loginId").GetString()!;
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(staff, "/api/auth/login", new { email = "Employee@org.test", password = f.Password })).StatusCode);
        await Login(staff, "Employee@org.test", initialPassword);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync($"/api/tenants/{f.TenantId}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, $"/api/tenants/{f.TenantId}/users/{f.Master}/reset-password", new { version = Guid.Empty })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        var log = await db.OrganizationChanges.SingleAsync(x => x.Action == "EmployeePasswordReset");
        Assert.Equal(f.Admin, log.ChangedByUserId); Assert.Equal(f.Employee, log.TargetUserId); Assert.DoesNotContain(initialPassword, log.AfterJson + log.BeforeJson);
    }

    [Fact]
    public async Task UserMutationIsTenantScopedAndDeactivationPreservesHistoryAndBillingAndRevokesLogin()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var employee = factory.Client(); var f = await Seed(factory);
        await Login(master, "Master@org.test", f.Password); await Login(employee, "Employee@org.test", f.Password);
        var rows = (await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/users")).GetProperty("items");
        var target = rows.EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == f.Employee);
        var version = target.GetProperty("version").GetGuid();
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/users/{f.Master}", new { version, name = "변조", role = "Employee", isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/users/{Guid.NewGuid()}", new { version, name = "변조", role = "Employee", isActive = false })).StatusCode);
        var endpoint = $"/api/tenants/{f.TenantId}/users/{f.Employee}";
        var updated = await AuthTests.Post(master, endpoint, new { version, name = "수정 직원", role = "Employee", isActive = false });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode); var saved = await Json(updated);
        Assert.Equal(HttpStatusCode.Unauthorized, (await employee.GetAsync($"/api/tenants/{f.TenantId}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(employee, "/api/auth/login", new { email = "Employee@org.test", password = f.Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(master, endpoint, new { version, name = "오래된 입력", role = "Administrator", isActive = true })).StatusCode);
        var restored = await AuthTests.Post(master, endpoint, new { version = saved.GetProperty("version").GetGuid(), name = "수정 직원", role = "Employee", isActive = true });
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode); var active = await Json(restored);
        Assert.Equal(target.GetProperty("registeredAt").GetString(), active.GetProperty("registeredAt").GetString());
        Assert.Equal(target.GetProperty("billingStartsAt").GetString(), active.GetProperty("billingStartsAt").GetString()); Assert.Equal(JsonValueKind.Null, active.GetProperty("billingEndsAt").ValueKind);
        await Login(employee, "Employee@org.test", f.Password);
        Assert.Equal("수정 직원", (await employee.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("user").GetProperty("displayName").GetString());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.True((await db.Users.FindAsync(f.Employee))!.IsActive); Assert.Equal("Employee", (await db.Users.FindAsync(f.Employee))!.DisplayName);
        Assert.Equal(2, await db.OrganizationChanges.CountAsync());
    }

    [Fact]
    public async Task ReadCreateAndUpdateGrantsAreIndependentAndRevokedWithoutRelogin()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); using var admin = factory.Client(); var f = await Seed(factory);
        await Login(master, "Master@org.test", f.Password); await Login(admin, "Administrator@org.test", f.Password);
        var grants = PermissionCatalog.Defaults(); grants["Administrator"]["users"] = ["menu", "read"];
        var save = await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/permissions", new { version = Guid.Empty, roles = grants }); Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/tenants/{f.TenantId}/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, $"/api/tenants/{f.TenantId}/users", Create())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, $"/api/tenants/{f.TenantId}/users/{f.Employee}/reset-password", new { version = Guid.Empty })).StatusCode);
        grants["Administrator"]["users"] = ["menu", "read", "create", "manageUsers"];
        var revision = (await Json(save)).GetProperty("version").GetGuid();
        save = await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/permissions", new { version = revision, roles = grants }); Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        await CreateStaff(admin, f.TenantId);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, $"/api/tenants/{f.TenantId}/users/{f.Employee}", new { version = Guid.Empty, name = "직원", role = "Employee", isActive = true })).StatusCode);
        grants["Administrator"]["users"] = [];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/permissions", new { version = (await Json(save)).GetProperty("version").GetGuid(), roles = grants })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync($"/api/tenants/{f.TenantId}/users")).StatusCode);
    }

    [Fact]
    public async Task AuditPersistenceFailureRollsBackNewIdentityAndMembership()
    {
        using var factory = new AuthFactory(); using var client = factory.Client(); var f = await Seed(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<EmployeeService>();
            // Invalid audit actor injects a relational FK failure after Identity created the account.
            await Assert.ThrowsAsync<DbUpdateException>(() => service.CreateAsync(f.TenantId, Guid.NewGuid(), new IebleWms.Api.Contracts.CreateEmployeeRequest {
                Name = "롤백 검증", LoginId = "rollback_staff", Email = "rollback@org.test", Role = "Employee"
            }, default));
        }
        using var verify = factory.Services.CreateScope(); var db = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(3, await db.Users.CountAsync()); Assert.Equal(3, await db.TenantMemberships.CountAsync());
        Assert.Equal(0, await db.OrganizationChanges.CountAsync());
    }

    [Fact]
    public async Task StaffSearchFiltersAndPaginationAndCrossTenantAccountResetAreSafe()
    {
        using var factory = new AuthFactory(); using var master = factory.Client(); var f = await Seed(factory); await Login(master, "Master@org.test", f.Password);
        var result = await CreateStaff(master, f.TenantId); var id = result.GetProperty("user").GetProperty("userId").GetGuid();
        var list = await master.GetFromJsonAsync<JsonElement>($"/api/tenants/{f.TenantId}/users?search=STAFF01&role=Employee&status=active&pageSize=1");
        Assert.Equal(1, list.GetProperty("total").GetInt32()); Assert.Single(list.GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await master.GetAsync($"/api/tenants/{f.TenantId}/users?pageSize=101")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            db.Add(new TenantMembership { UserId = id, TenantId = f.ForeignId }); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(master, $"/api/tenants/{f.TenantId}/users/{id}/reset-password", new { version = result.GetProperty("user").GetProperty("version").GetGuid() })).StatusCode);
        using var check = factory.Services.CreateScope(); Assert.False((await check.ServiceProvider.GetRequiredService<WmsDbContext>().Users.FindAsync(f.Master))!.MustChangePassword);
    }
}
