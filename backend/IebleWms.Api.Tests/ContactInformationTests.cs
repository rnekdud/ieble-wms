using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class ContactInformationTests
{
    [Fact] public async Task ContactInformationLifecycle() { using var f = new AuthFactory(); using var init = f.Client(); await Scenario(f); }
    [ScanPostgresFact] public async Task PostgresContactInformation() { using var f = new ScanPostgresFactory(); using var init = f.Client(); await Scenario(f); }
    static Guid Id(JsonElement e) => e.GetProperty("userId").GetGuid();
    static Guid Version(JsonElement e) => e.GetProperty("version").GetGuid();
    static async Task<JsonElement> Post(HttpClient c, string url, object body, HttpStatusCode status = HttpStatusCode.OK)
    {
        var r = await AuthTests.Post(c, url, body);
        Assert.True(r.StatusCode == status, await r.Content.ReadAsStringAsync());
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }
    static async Task Scenario(WebApplicationFactory<Program> f)
    {
        using var c = f.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        Guid tenant, other, department, position, partner;
        var password = "Test1!" + Guid.NewGuid().ToString("N");
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var t = new Tenant { Code = "CONTACTS", Name = "연락처 QA", BillingStatus = TenantBillingStatus.Paid };
            var o = new Tenant { Code = "OTHER", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid }; tenant = t.Id; other = o.Id;
            foreach (var (name, org, role) in new[] { ("Master", t, TenantRole.Master), ("Reader", t, TenantRole.Employee), ("Other", o, TenantRole.Master) }) {
                var user = new ApplicationUser { UserName = name, Email = name + "@contacts.test", DisplayName = name };
                Assert.True((await users.CreateAsync(user, password)).Succeeded);
                db.TenantMemberships.Add(new() { Tenant = org, User = user, Role = role, IsDefault = true });
            }
            var d = new Department { TenantId = tenant, Name = "물류팀", NormalizedName = "물류팀" }; var p = new JobPosition { TenantId = tenant, Name = "사원", NormalizedName = "사원" }; department = d.Id; position = p.Id; db.AddRange(d, p);
            for (var i = 0; i < 23; i++) db.Partners.Add(new() { TenantId = tenant, Code = $"P{i:00}", NormalizedCode = $"P{i:00}", Name = $"거래처 {i:00}", Email = $"sales{i:00}@search-contact.test", CreationRequestId = Guid.NewGuid(), IsActive = i != 22 });
            var chosen = new Partner { TenantId = tenant, Code = "EMAIL", NormalizedCode = "EMAIL", Name = "이메일 거래처", Email = "long-business-contact-address-for-layout-review@partners.example.test", CreationRequestId = Guid.NewGuid() }; partner = chosen.Id; db.Partners.Add(chosen);
            db.Partners.Add(new() { TenantId = tenant, Code = "EMPTY", NormalizedCode = "EMPTY", Name = "이메일 없는 거래처", CreationRequestId = Guid.NewGuid() });
            db.Partners.Add(new() { TenantId = other, Code = "FOREIGN", NormalizedCode = "FOREIGN", Name = "타사 비공개", Email = "private@search-contact.test", CreationRequestId = Guid.NewGuid() });
            await db.SaveChangesAsync();
        }
        await Post(c, "/api/auth/login", new { email = "Master", password }); var root = $"/api/tenants/{tenant}";
        async Task<JsonElement> Get(string path) { var r = await c.GetAsync(path); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await r.Content.ReadFromJsonAsync<JsonElement>(); }
        var page = await Get(root + "/partners?search=SEARCH-CONTACT.TEST&page=2&pageSize=20"); Assert.Equal(23, page.GetProperty("total").GetInt32()); Assert.Equal(3, page.GetProperty("items").GetArrayLength());
        Assert.Equal(22, (await Get(root + "/partners?search=search-contact.test&status=active")).GetProperty("total").GetInt32());
        Assert.Equal(0, (await Get(root + "/partners?search=private@search-contact.test")).GetProperty("total").GetInt32());
        var pd = await Get(root + "/partners/" + partner);
        await Post(c, root + "/partners/" + partner, new PartnerRequest { Version = Version(pd), Code = "EMAIL", Name = "이메일 거래처", Type = "SUPPLIER", Email = "updated-contact@partners.example.test" });
        Assert.Equal(1, (await Get(root + "/partners?search=updated-contact@")).GetProperty("total").GetInt32());
        CreateEmployeeRequest Create(string login, string? phone, bool external = false) => new() { LoginId = login, Name = login, Email = login + "@contacts.test", ContactPhone = phone, AccountType = external ? "External" : "Internal", CompanyName = external ? "연락처 협력사" : null, DepartmentId = external ? null : department, PositionId = external ? null : position };
        var internalUser = (await Post(c, root + "/users", Create("ContactInternal", "  +82 (2) 1234-5678  "), HttpStatusCode.Created)).GetProperty("user");
        var externalUser = (await Post(c, root + "/users", Create("ContactExternal", "010-9876-5432", true), HttpStatusCode.Created)).GetProperty("user");
        var emptyUser = (await Post(c, root + "/users", Create("ContactEmpty", null), HttpStatusCode.Created)).GetProperty("user");
        Assert.Equal("+82 (2) 1234-5678", internalUser.GetProperty("contactPhone").GetString()); Assert.Null(emptyUser.GetProperty("contactPhone").GetString()); Assert.Equal("010-9876-5432", externalUser.GetProperty("contactPhone").GetString());
        var id = Id(internalUser); var url = root + "/users/" + id;
        object security;
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var u = await db.Users.SingleAsync(x => x.Id == id);
            u.PhoneNumber = "+12025550123"; u.PhoneNumberConfirmed = true; await db.SaveChangesAsync();
            security = new { u.PhoneNumber, u.PhoneNumberConfirmed, u.SecurityStamp, u.PasswordHash, u.MustChangePassword };
            // The same global user has a separate tenant contact. Updating one must never leak into the other.
            db.TenantMemberships.Add(new() { TenantId = other, UserId = id, ContactPhone = "02-999-7777" }); await db.SaveChangesAsync();
        }
        Dictionary<string, object?> Update(JsonElement user, string type = "Internal") => new() { ["version"] = Version(user), ["name"] = user.GetProperty("name").GetString(), ["role"] = "Employee", ["isActive"] = true, ["accountType"] = type, ["departmentId"] = type == "Internal" ? department : null, ["positionId"] = type == "Internal" ? position : null, ["companyName"] = type == "External" ? "연락처 협력사" : null };
        var patch = Update(internalUser); patch["contactPhone"] = "010-1111-2222"; var changed = await Post(c, url, patch);
        Assert.Equal(department, changed.GetProperty("departmentId").GetGuid()); Assert.Equal(position, changed.GetProperty("positionId").GetGuid()); Assert.Equal("Employee", changed.GetProperty("role").GetString());
        Assert.Equal(internalUser.GetProperty("billingStartsAt").GetString(), changed.GetProperty("billingStartsAt").GetString());
        Assert.Equal(1, (await Get(root + "/users?search=1111-2222")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, url, patch)).StatusCode);
        foreach (var bad in new[] { "010\r\n1234", "010\t1234", "phone", "010+12", "<script>", new string('1', 51), "++123" }) {
            patch = Update(changed); patch["contactPhone"] = bad; Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url, patch)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, root + "/users", Create("InvalidContact", bad))).StatusCode);
        }
        patch = Update(changed); patch["contactPhone"] = "  "; changed = await Post(c, url, patch); Assert.Null(changed.GetProperty("contactPhone").GetString());
        patch = Update(changed); patch["contactPhone"] = "010-1111-2222"; changed = await Post(c, url, patch);
        // Omitted contact means keep it; explicit null/empty means erase it. Account-type transitions preserve it.
        changed = await Post(c, url, Update(changed, "External")); Assert.Equal("010-1111-2222", changed.GetProperty("contactPhone").GetString());
        changed = await Post(c, url, Update(changed)); Assert.Equal("010-1111-2222", changed.GetProperty("contactPhone").GetString());
        var extPatch = Update(externalUser, "External"); extPatch["contactPhone"] = null; externalUser = await Post(c, root + "/users/" + Id(externalUser), extPatch); Assert.Null(externalUser.GetProperty("contactPhone").GetString());
        extPatch = Update(externalUser, "External"); extPatch["contactPhone"] = "010-9876-5432"; externalUser = await Post(c, root + "/users/" + Id(externalUser), extPatch);
        await Post(c, "/api/auth/login", new { email = "Reader", password });
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/users")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, url, Update(changed))).StatusCode);
        await Post(c, "/api/auth/login", new { email = "Other", password }); Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/users")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, url, Update(changed))).StatusCode);
        await Post(c, "/api/auth/login", new { email = "ContactExternal", password = "ContactExternal" });
        await Post(c, "/api/auth/change-password", new { currentPassword = "ContactExternal", newPassword = password, confirmPassword = password });
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(root + "/users")).StatusCode); Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, url, Update(changed))).StatusCode);
        using (var scope = f.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var u = await db.Users.SingleAsync(x => x.Id == id);
            Assert.Equal(JsonSerializer.Serialize(security), JsonSerializer.Serialize(new { u.PhoneNumber, u.PhoneNumberConfirmed, u.SecurityStamp, u.PasswordHash, u.MustChangePassword }));
            Assert.Equal("02-999-7777", (await db.TenantMemberships.SingleAsync(x => x.TenantId == other && x.UserId == id)).ContactPhone);
            var audits = await db.OrganizationChanges.Where(x => x.TenantId == tenant && x.TargetUserId == id && x.Action == "EmployeeUpdated").ToListAsync();
            Assert.Contains(audits, a => JsonDocument.Parse(a.AfterJson).RootElement.GetProperty("ContactPhone").GetString() == "010-1111-2222");
            Assert.DoesNotContain(audits, a => a.AfterJson.Contains("PasswordHash") || a.AfterJson.Contains("SecurityStamp"));
            var path = Environment.GetEnvironmentVariable("WMS_CONTACT_QA_FIXTURE");
            if (db.Database.IsNpgsql() && !string.IsNullOrEmpty(path)) await File.WriteAllTextAsync(path, JsonSerializer.Serialize(new { tenant, other, password, department, position, partner, internalId = id, externalId = Id(externalUser), emptyId = Id(emptyUser) }));
        }
    }
}
