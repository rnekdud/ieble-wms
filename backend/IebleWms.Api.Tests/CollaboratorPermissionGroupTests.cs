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
public sealed class CollaboratorPermissionGroupTests
{
    [Fact] public async Task CompanyCeilingsSessionsIsolationAndIndependentGrants() { using var f = new AuthFactory(); using var init = f.Client(); await Scenario(f); }
    [ScanPostgresFact] public async Task PostgresCompanyCeilingsSessionsIsolationAndIndependentGrants() { using var f = new ScanPostgresFactory(); using var init = f.Client(); await Scenario(f); }
    [Fact] public void LegacyAdministratorRoleCannotExceedCollaboratorCeiling()
    {
        var grants = ExternalPermissionPolicy.Empty(); grants["products"] = ["menu", "read"];
        var group = new ExternalCollaborator { PermissionsJson = JsonSerializer.Serialize(grants) };
        var member = new TenantMembership { AccountType = "External", Role = TenantRole.Master, ExternalPermissionsJson = "{\"products\":[\"menu\",\"read\",\"create\"],\"users\":[\"menu\",\"read\"]}" };
        var effective = CollaboratorAccess.Effective(group, member);
        Assert.Equal(new[] { "menu", "read" }, effective["products"]); Assert.False(effective.ContainsKey("users"));
        member.UseIndividualPermissions = true;
        effective = CollaboratorAccess.Effective(group, member); Assert.DoesNotContain("create", effective["products"]); Assert.False(effective.ContainsKey("users"));
    }
    static HttpClient Client(WebApplicationFactory<Program> f) => f.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    static async Task<JsonElement> Json(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { var text = await r.Content.ReadAsStringAsync(); Assert.True(status == r.StatusCode, $"{status} expected, got {r.StatusCode}: {text}"); return JsonDocument.Parse(text).RootElement.Clone(); }
    static async Task Scenario(WebApplicationFactory<Program> f)
    {
        string stamp = Guid.NewGuid().ToString("N")[..10], password = "QA1!" + stamp, masterLogin = "group-owner-" + stamp, otherLogin = "group-other-" + stamp;
        Guid tenant, other, partner, master;
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var t = new Tenant { Code = "GRP" + stamp.ToUpperInvariant(), Name = "협력사 권한 QA", BillingStatus = TenantBillingStatus.Paid }; var o = new Tenant { Code = "GRO" + stamp.ToUpperInvariant(), Name = "격리 기업 QA", BillingStatus = TenantBillingStatus.Paid };
            tenant = t.Id; other = o.Id; master = Guid.Empty;
            foreach (var (target, login) in new[] { (t, masterLogin), (o, otherLogin) }) { var u = new ApplicationUser { UserName = login, Email = login + "@group.test", DisplayName = login }; Assert.True((await users.CreateAsync(u, password)).Succeeded); db.TenantMemberships.Add(new() { Tenant = target, User = u, Role = TenantRole.Master, IsDefault = true }); if (target == t) master = u.Id; }
            var p = new Partner { TenantId = tenant, Code = "GROUP-A", NormalizedCode = "GROUP-A", Name = "A 입고 협력사", CreationRequestId = Guid.NewGuid() }; partner = p.Id; db.Partners.Add(p); await db.SaveChangesAsync();
        }
        using var owner = Client(f); using var foreign = Client(f); using var a1 = Client(f); using var a2 = Client(f); using var b1 = Client(f);
        async Task Login(HttpClient c, string login, string pass) => await Json(await AuthTests.Post(c, "/api/auth/login", new { email = login, password = pass }));
        await Login(owner, masterLogin, password); await Login(foreign, otherLogin, password);
        var root = $"/api/tenants/{tenant}";
        async Task<JsonElement> Add(string suffix, string name, Guid? partnerId = null, Guid? collaboratorId = null) => (await Json(await AuthTests.Post(owner, root + "/users", new CreateEmployeeRequest { Name = suffix, LoginId = stamp + suffix, Email = stamp + suffix + "@group.test", AccountType = "External", CompanyName = name, PartnerId = partnerId, CollaboratorId = collaboratorId }), HttpStatusCode.Created)).GetProperty("user");
        var u1 = await Add("a1", "A 입고 협력사", partner); var groupA = u1.GetProperty("collaboratorId").GetGuid();
        var u2 = await Add("a2", "A 입고 협력사", collaboratorId: groupA); Assert.Equal(groupA, u2.GetProperty("collaboratorId").GetGuid());
        var ub = await Add("b1", "B 출고 협력사"); var groupB = ub.GetProperty("collaboratorId").GetGuid();
        var duplicate = await Add("same", "B 출고 협력사"); Assert.NotEqual(groupB, duplicate.GetProperty("collaboratorId").GetGuid());
        var list = await Json(await owner.GetAsync(root + "/collaborators/choices")); Assert.Equal(3, list.GetProperty("total").GetInt32());
        Assert.Equal(2, (await Json(await owner.GetAsync(root + $"/collaborators/{groupA}/members"))).GetProperty("total").GetInt32());
        var foreignUser = (await Json(await AuthTests.Post(foreign, $"/api/tenants/{other}/users", new CreateEmployeeRequest { Name = "타사 외부 계정", LoginId = stamp + "foreign", Email = stamp + "foreign@group.test", AccountType = "External", CompanyName = "타사 협력사" }), HttpStatusCode.Created)).GetProperty("user");
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + "/users", new CreateEmployeeRequest { Name = "잘못된 연결", LoginId = stamp + "attack", Email = stamp + "attack@group.test", AccountType = "External", CollaboratorId = foreignUser.GetProperty("collaboratorId").GetGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await foreign.GetAsync(root + "/collaborators/choices")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await foreign.GetAsync($"/api/tenants/{other}/collaborators/{groupA}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await foreign.GetAsync(root + $"/collaborators/{groupA}/history")).StatusCode);
        foreach (var (c, suffix) in new[] { (a1, "a1"), (a2, "a2"), (b1, "b1") }) { await Login(c, stamp + suffix, stamp + suffix); await Json(await AuthTests.Post(c, "/api/auth/change-password", new { currentPassword = stamp + suffix, newPassword = password, confirmPassword = password })); Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/products")).StatusCode); }
        var grantA = ExternalPermissionPolicy.Empty(); grantA["receipts"] = ["menu", "read", "update"]; grantA["products"] = ["menu", "read"];
        var grantB = ExternalPermissionPolicy.Empty(); grantB["shipments"] = ["menu", "read", "update"];
        async Task<JsonElement> Save(Guid id, Dictionary<string, string[]> grants, bool active = true) { var before = await Json(await owner.GetAsync(root + $"/collaborators/{id}")); return await Json(await AuthTests.Post(owner, root + $"/collaborators/{id}/permissions", new { version = before.GetProperty("version"), grants, isActive = active })); }
        var initialA = await Json(await owner.GetAsync(root + $"/collaborators/{groupA}"));
        await Save(groupA, grantA); await Save(groupB, grantB);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(owner, root + $"/collaborators/{groupA}/permissions", new { version = initialA.GetProperty("version"), grants = grantB, isActive = true })).StatusCode);
        foreach (var c in new[] { a1, a2 }) { Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(root + "/receipts")).StatusCode); Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(root + "/products")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/shipments")).StatusCode); }
        Assert.Equal(HttpStatusCode.OK, (await b1.GetAsync(root + "/shipments")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await b1.GetAsync(root + "/receipts")).StatusCode);
        foreach (var path in new[] { "/users", "/permissions", "/collaborators/choices", "/subscription" }) Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync(root + path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(a1, root + $"/collaborators/{groupB}/permissions", new { version = Guid.NewGuid(), grants = grantA, isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync($"/api/tenants/{other}/products")).StatusCode);
        var personalUrl = root + "/permissions/users/" + u1.GetProperty("userId").GetGuid(); var personal = await Json(await owner.GetAsync(personalUrl));
        // Personal settings cannot grant a denied company action, even if explicitly saved.
        var restriction = ExternalPermissionPolicy.Empty(); restriction["products"] = ["menu", "read", "create"]; restriction["shipments"] = ["menu", "read"];
        await Json(await AuthTests.Post(owner, personalUrl, new { version = personal.GetProperty("version"), grants = restriction, useIndividualPermissions = true }));
        Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync(root + "/receipts")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync(root + "/shipments")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(a1, root + "/products", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a2.GetAsync(root + "/receipts")).StatusCode);
        personal = await Json(await owner.GetAsync(personalUrl)); await Json(await AuthTests.Post(owner, personalUrl, new { version = personal.GetProperty("version"), grants = restriction, useIndividualPermissions = false }));
        await Save(groupA, ExternalPermissionPolicy.Empty()); Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync(root + "/products")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await a2.GetAsync(root + "/receipts")).StatusCode); Assert.Equal(HttpStatusCode.OK, (await b1.GetAsync(root + "/shipments")).StatusCode);
        await Save(groupA, grantA, false); Assert.Equal(HttpStatusCode.Unauthorized, (await a1.GetAsync(root + "/workspace")).StatusCode); Assert.Equal(HttpStatusCode.Unauthorized, (await a2.GetAsync(root + "/workspace")).StatusCode);
        using var blockedLogin = Client(f); Assert.Equal(HttpStatusCode.Unauthorized, (await AuthTests.Post(blockedLogin, "/api/auth/login", new { email = stamp + "a1", password })).StatusCode);
        await Save(groupA, grantA); await Login(a1, stamp + "a1", password); await Login(a2, stamp + "a2", password);
        var settings = await Json(await owner.GetAsync(root + $"/collaborators/{groupA}")); var invalid = ExternalPermissionPolicy.Empty(); invalid["users"] = ["menu", "read"];
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(owner, root + $"/collaborators/{groupA}/permissions", new { version = settings.GetProperty("version"), grants = invalid, isActive = true })).StatusCode);
        // Moving companies clears old individual restrictions and adopts only the new ceiling.
        var currentMember = (await Json(await owner.GetAsync(root + "/users?search=" + stamp + "a1"))).GetProperty("items")[0];
        async Task<JsonElement> Move(JsonElement current, Guid company) => await Json(await AuthTests.Post(owner, root + "/users/" + u1.GetProperty("userId").GetGuid(), new UpdateEmployeeRequest { Version = current.GetProperty("version").GetGuid(), Name = "a1", Role = "Employee", AccountType = "External", CollaboratorId = company, IsActive = true }));
        var moved = await Move(currentMember, groupB); Assert.False(moved.GetProperty("useIndividualPermissions").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await a1.GetAsync(root + "/shipments")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await a1.GetAsync(root + "/receipts")).StatusCode);
        await Move(moved, groupA); Assert.Equal(HttpStatusCode.OK, (await a1.GetAsync(root + "/receipts")).StatusCode);
        var audit = await Json(await owner.GetAsync(root + $"/collaborators/{groupA}/history")); Assert.Equal(4, audit.GetProperty("total").GetInt32());
        await Save(groupA, grantA); Assert.Equal(4, (await Json(await owner.GetAsync(root + $"/collaborators/{groupA}/history"))).GetProperty("total").GetInt32());
        // Two writers with one version: one wins, the other is rejected; B stays unchanged.
        if (f is ScanPostgresFactory) {
            var concurrent = await Json(await owner.GetAsync(root + $"/collaborators/{groupA}"));
            var results = await Task.WhenAll(AuthTests.Post(owner, root + $"/collaborators/{groupA}/permissions", new { version = concurrent.GetProperty("version"), grants = grantB, isActive = true }), AuthTests.Post(owner, root + $"/collaborators/{groupA}/permissions", new { version = concurrent.GetProperty("version"), grants = ExternalPermissionPolicy.Empty(), isActive = true }));
            Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict); await Save(groupA, grantA);
        }
        using (var scope = f.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); Assert.Equal(TenantRole.Master, (await db.TenantMemberships.SingleAsync(x => x.TenantId == tenant && x.UserId == master)).Role); Assert.All(await db.CollaboratorPermissionChanges.Where(x => x.TenantId == tenant).ToListAsync(), x => Assert.Equal(master, x.ChangedByUserId)); }
        var fixturePath = Environment.GetEnvironmentVariable("WMS_COLLABORATOR_QA_FIXTURE");
        if (f is ScanPostgresFactory && fixturePath != null) await File.WriteAllTextAsync(fixturePath, JsonSerializer.Serialize(new { tenant, other, partner, masterLogin, password, groupA, groupB, groupSame = duplicate.GetProperty("collaboratorId").GetGuid(), a1 = stamp + "a1", a2 = stamp + "a2", b1 = stamp + "b1", userA = u1.GetProperty("userId").GetGuid() }));
    }
}
