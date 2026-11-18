using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class ExternalCollaboratorTests
{
    [Fact] public async Task ExternalLifecyclePermissionsTenantIsolationAndBilling() { using var f = new AuthFactory(); using var initialize = f.Client(); await Scenario(f); }
    [ScanPostgresFact] public async Task PostgresExternalLifecyclePermissionsTenantIsolationAndBilling() { using var f = new ScanPostgresFactory(); using var initialize = f.Client(); await Scenario(f); }
    static HttpClient Client(WebApplicationFactory<Program> f) => f.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    static async Task<JsonElement> Json(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { var text = await r.Content.ReadAsStringAsync(); Assert.True(r.StatusCode == status, $"Expected {status}, got {r.StatusCode}: {text}"); return JsonDocument.Parse(text).RootElement.Clone(); }
    static async Task Login(HttpClient c, string id, string password) => await Json(await AuthTests.Post(c, "/api/auth/login", new { email = id, password }));
    static async Task Scenario(WebApplicationFactory<Program> f)
    {
        var stamp = Guid.NewGuid().ToString("N")[..12]; var password = "Start1!" + stamp;
        Guid tenant, other, partner, foreignPartner, master; var masterLogin = "owner-" + stamp; var adminLogin = "admin-" + stamp; var staffLogin = "staff-" + stamp;
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var t = new Tenant { Code = "EXT" + stamp.ToUpperInvariant(), Name = "외부 계정 QA", BillingStatus = TenantBillingStatus.Paid };
            var o = new Tenant { Code = "OTH" + stamp.ToUpperInvariant(), Name = "타사 QA", BillingStatus = TenantBillingStatus.Paid };
            tenant = t.Id; other = o.Id; master = Guid.Empty;
            foreach (var (name, role) in new[] { (masterLogin, TenantRole.Master), (adminLogin, TenantRole.Administrator), (staffLogin, TenantRole.Employee) }) {
                var u = new ApplicationUser { UserName = name, Email = name + "@external.test", DisplayName = name };
                Assert.True((await users.CreateAsync(u, password)).Succeeded); db.TenantMemberships.Add(new() { Tenant = t, User = u, Role = role, IsDefault = true }); if (role == TenantRole.Master) master = u.Id;
            }
            var otherOwner = new ApplicationUser { UserName = "foreign-" + stamp, Email = "foreign-" + stamp + "@external.test", DisplayName = "타사 마스터" };
            Assert.True((await users.CreateAsync(otherOwner, password)).Succeeded);
            db.TenantMemberships.Add(new() { Tenant = o, User = otherOwner, Role = TenantRole.Master, IsDefault = true });
            var p = new Partner { TenantId = tenant, Code = "SUPPLIER", NormalizedCode = "SUPPLIER", Name = "연결 업체", CreationRequestId = Guid.NewGuid() };
            var q = new Partner { TenantId = other, Code = "OTHER", NormalizedCode = "OTHER", Name = "타사 업체", CreationRequestId = Guid.NewGuid() }; partner = p.Id; foreignPartner = q.Id; db.Partners.AddRange(p, q); await db.SaveChangesAsync();
        }
        using var owner = Client(f); using var admin = Client(f); using var staff = Client(f); using var external = Client(f);
        await Login(owner, masterLogin, password); await Login(admin, adminLogin, password); await Login(staff, staffLogin, password);
        var root = $"/api/tenants/{tenant}"; var baseline = await owner.GetFromJsonAsync<JsonElement>(root + "/subscription");
        var login = "outside-" + stamp;
        CreateEmployeeRequest Request(string suffix = "") => new() { Name = "외부 담당자", LoginId = login + suffix, Email = login + suffix + "@external.test", AccountType = "External", CompanyName = "연결 업체", PartnerId = partner, ContactPhone = "010-1234-5678", ContactEmail = "contact@external.test" };
        foreach (var bad in new[] { "Administrator", "Master" }) { var r = Request(); r.Role = bad; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", r)).StatusCode); }
        var foreign = Request(); foreign.PartnerId = foreignPartner; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", foreign)).StatusCode);
        var org = Request(); org.DepartmentId = Guid.NewGuid(); Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", org)).StatusCode);
        var noCompany = Request(); noCompany.CompanyName = " "; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", noCompany)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", new { name = "Attack", loginId = login, email = login + "@external.test", accountType = "External", companyName = "업체", systemRole = "IebleAdministrator" })).StatusCode);
        var created = (await Json(await AuthTests.Post(owner, root + "/users", Request()), HttpStatusCode.Created)).GetProperty("user"); var id = created.GetProperty("userId").GetGuid();
        Assert.True(created.GetProperty("mustChangePassword").GetBoolean()); Assert.Equal("External", created.GetProperty("accountType").GetString()); Assert.Equal(partner, created.GetProperty("partnerId").GetGuid()); Assert.Equal(JsonValueKind.Null, created.GetProperty("departmentId").ValueKind);
        var standaloneRequest = Request("-free"); standaloneRequest.PartnerId = null; standaloneRequest.CompanyName = "직접 입력 업체";
        await Json(await AuthTests.Post(owner, root + "/users", standaloneRequest), HttpStatusCode.Created);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(owner, root + "/users", Request())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync(root + "/products")).StatusCode);
        var list = await owner.GetFromJsonAsync<JsonElement>(root + "/users?accountType=External&search=" + Uri.EscapeDataString("연결 업체")); Assert.Equal(1, list.GetProperty("total").GetInt32());
        var options = await owner.GetFromJsonAsync<JsonElement>(root + "/users/partner-options"); Assert.DoesNotContain(options.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == foreignPartner);
        var chart = await owner.GetFromJsonAsync<JsonElement>(root + "/organization-chart"); Assert.DoesNotContain(chart.GetProperty("employees").EnumerateArray(), x => x.GetProperty("userId").GetGuid() == id);
        var billing = await owner.GetFromJsonAsync<JsonElement>(root + "/subscription"); Assert.Equal(baseline.GetProperty("currentUsers").GetInt32() + 2, billing.GetProperty("currentUsers").GetInt32()); Assert.Equal(baseline.GetProperty("estimatedMonthlyKrw").GetInt64() + 2000, billing.GetProperty("estimatedMonthlyKrw").GetInt64());
        await Login(external, login, login); Assert.Equal(HttpStatusCode.Forbidden, (await external.GetAsync(root + "/products")).StatusCode);
        await Json(await AuthTests.Post(external, "/api/auth/change-password", new { currentPassword = login, newPassword = password, confirmPassword = password }));
        foreach (var path in new[] { "/products", "/dashboard", "/users", "/subscription", "/permissions", "/organization-chart" }) Assert.Equal(HttpStatusCode.Forbidden, (await external.GetAsync(root + path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await external.GetAsync($"/api/tenants/{other}/workspace")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(external, "/api/auth/select-tenant", new { tenantId = other })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await external.GetAsync("/api/admin/overview")).StatusCode);
        var groupUrl = root + "/collaborators/" + created.GetProperty("collaboratorId").GetGuid();
        var group = await owner.GetFromJsonAsync<JsonElement>(groupUrl);
        var ceiling = ExternalPermissionPolicy.Empty(); ceiling["products"] = ["menu", "read", "create"];
        await Json(await AuthTests.Post(owner, groupUrl + "/permissions", new { version = group.GetProperty("version"), grants = ceiling, isActive = true }));
        var permissionUrl = root + "/permissions/users/" + id;
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync(permissionUrl)).StatusCode);
        var settings = await owner.GetFromJsonAsync<JsonElement>(permissionUrl); var grants = ExternalPermissionPolicy.Empty(); grants["products"] = ["menu", "read"];
        var invalid = ExternalPermissionPolicy.Empty(); invalid["users"] = ["menu", "read"]; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, permissionUrl, new { version = settings.GetProperty("version").GetGuid(), grants = invalid })).StatusCode);
        var saved = await Json(await AuthTests.Post(owner, permissionUrl, new { version = settings.GetProperty("version").GetGuid(), grants }));
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(owner, permissionUrl, new { version = settings.GetProperty("version").GetGuid(), grants = ExternalPermissionPolicy.Empty() })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await external.GetAsync(root + "/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(external, root + "/products", new { })).StatusCode);
        foreach (var action in new[] { "/delete-check", "/delete", "/" + Guid.NewGuid() + "/delete" }) Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(external, root + "/products" + action, new { })).StatusCode);
        var workspace = await external.GetFromJsonAsync<JsonElement>(root + "/workspace"); Assert.False(workspace.GetProperty("canManageBilling").GetBoolean()); Assert.Equal(2, workspace.GetProperty("permissions").GetProperty("products").GetArrayLength());
        grants["products"] = ["menu", "read", "create"];
        saved = await Json(await AuthTests.Post(owner, permissionUrl, new { version = saved.GetProperty("version").GetGuid(), grants }));
        await Json(await AuthTests.Post(external, root + "/products", new { requestId = Guid.NewGuid(), code = "EXT-PRODUCT", name = "허용된 외부 등록", unit = "EA", isActive = true }), HttpStatusCode.Created);
        saved = await Json(await AuthTests.Post(owner, permissionUrl, new { version = saved.GetProperty("version").GetGuid(), grants = ExternalPermissionPolicy.Empty() }));
        Assert.Equal(HttpStatusCode.Forbidden, (await external.GetAsync(root + "/products")).StatusCode);
        var candidates = await owner.GetFromJsonAsync<JsonElement>(root + "/users/master-transfer"); Assert.DoesNotContain(candidates.GetProperty("candidates").EnumerateArray(), x => x.GetProperty("userId").GetGuid() == id);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users/master-transfer", new { targetUserId = id, currentMasterVersion = candidates.GetProperty("currentMasterVersion").GetGuid(), targetVersion = saved.GetProperty("version").GetGuid(), currentPassword = password, reason = "외부 승격 차단" })).StatusCode);
        UpdateEmployeeRequest Update(Guid version, bool active = true, string type = "External") => new() { Version = version, Name = "수정 외부 담당자", AccountType = type, CompanyName = type == "External" ? "수정 업체" : null, PartnerId = type == "External" ? partner : null, IsActive = active, Role = "Employee" };
        var stopped = await Json(await AuthTests.Post(owner, root + "/users/" + id, Update(saved.GetProperty("version").GetGuid(), false)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await external.GetAsync(root + "/workspace")).StatusCode);
        var resumed = await Json(await AuthTests.Post(owner, root + "/users/" + id, Update(stopped.GetProperty("version").GetGuid()))); await Login(external, login, password);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(admin, root + "/users/" + id, Update(resumed.GetProperty("version").GetGuid(), type: "Internal"))).StatusCode);
        grants["products"] = ["menu", "read"];
        var beforeConversion = await Json(await AuthTests.Post(owner, permissionUrl, new { version = resumed.GetProperty("version").GetGuid(), grants }));
        resumed = beforeConversion;
        var internalUser = await Json(await AuthTests.Post(owner, root + "/users/" + id, Update(resumed.GetProperty("version").GetGuid(), type: "Internal"))); Assert.Equal("Internal", internalUser.GetProperty("accountType").GetString());
        Assert.Equal(HttpStatusCode.OK, (await external.GetAsync(root + "/products")).StatusCode);
        var externalAgain = await Json(await AuthTests.Post(owner, root + "/users/" + id, Update(internalUser.GetProperty("version").GetGuid()))); Assert.False(externalAgain.GetProperty("useIndividualPermissions").GetBoolean()); Assert.Equal(HttpStatusCode.OK, (await external.GetAsync(root + "/products")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(owner, root + "/users/" + id + "/reset-password", new { version = externalAgain.GetProperty("version").GetGuid() })).StatusCode); Assert.Equal(HttpStatusCode.OK, (await external.GetAsync(root + "/workspace")).StatusCode);
        await Login(external, login, password);
        using var verify = f.Services.CreateScope(); var context = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(2, await context.Partners.CountAsync(x => x.TenantId == tenant || x.TenantId == other)); Assert.Equal(2, await context.Tenants.CountAsync(x => x.Id == tenant || x.Id == other));
        var member = await context.TenantMemberships.Include(x => x.User).SingleAsync(x => x.TenantId == tenant && x.UserId == id); Assert.Equal(SystemRole.None, member.User.SystemRole); Assert.Equal(TenantRole.Employee, member.Role); Assert.NotNull(member.BillingStartsAt); Assert.Null(member.BillingEndsAt);
        Assert.True(await context.OrganizationChanges.AnyAsync(x => x.TenantId == tenant && x.TargetUserId == id && x.Action == "ExternalPermissionsUpdated")); Assert.True(await context.OrganizationChanges.AnyAsync(x => x.TenantId == tenant && x.TargetUserId == id && x.Action == "EmployeeUpdated"));
        Assert.Equal(TenantRole.Master, (await context.TenantMemberships.SingleAsync(x => x.TenantId == tenant && x.UserId == master)).Role);
        var fixturePath = Environment.GetEnvironmentVariable("WMS_EXTERNAL_QA_FIXTURE");
        if (context.Database.IsNpgsql() && !string.IsNullOrEmpty(fixturePath)) await File.WriteAllTextAsync(fixturePath, JsonSerializer.Serialize(new { tenant, other, partner, masterLogin, password, externalLogin = login, externalUserId = id }));
    }
}
