using System.Net;
using System.Net.Http.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;
public sealed class PermissionGradeTests
{
    private sealed record Settings(Guid Version, Dictionary<string, Dictionary<string, string[]>> Roles);
    [Fact] public async Task TenantGradesApplyToLiveSessionsPreserveIdentityAndDenyEscalation()
    {
        using var f = new AuthFactory(); using var master = f.Client(); using var employee = f.Client(); using var administrator = f.Client();
        await Exercise(f, master, employee, administrator);
    }
    [ScanPostgresFact] public async Task PostgresTenantGradesAndLiveAuthorization()
    {
        using var f = new ScanPostgresFactory(); using var master = f.Client(); using var employee = f.Client(); using var administrator = f.Client();
        await Exercise(f, master, employee, administrator);
    }
    private static async Task Exercise(WebApplicationFactory<Program> factory, HttpClient master, HttpClient employee, HttpClient administrator)
    {
        var password = "Grade1!" + Guid.NewGuid().ToString("N");
        var suffix = Guid.NewGuid().ToString("N")[..8];
        Guid tenantId, foreignId, employeeId;
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var tenant = new Tenant { Code = "GRADE" + suffix.ToUpperInvariant(), Name = "권한 QA", BillingStatus = TenantBillingStatus.Paid };
            var foreign = new Tenant { Code = "OTHER" + suffix.ToUpperInvariant(), Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid };
            employeeId = Guid.Empty;
            foreach (var role in new[] { TenantRole.Master, TenantRole.Administrator, TenantRole.Employee }) {
                var u = new ApplicationUser { UserName = role + suffix, Email = role + suffix + "@example.test", DisplayName = role.ToString() };
                Assert.True((await users.CreateAsync(u, password)).Succeeded);
                db.Add(new TenantMembership { Tenant = tenant, User = u, Role = role, IsDefault = true });
                if (role == TenantRole.Employee) employeeId = u.Id;
                if (role == TenantRole.Master) db.Add(new TenantMembership { Tenant = foreign, User = u, Role = TenantRole.Master });
            }
            await db.SaveChangesAsync(); tenantId = tenant.Id; foreignId = foreign.Id;
        }
        foreach (var (client, role) in new[] { (master, "Master"), (employee, "Employee"), (administrator, "Administrator") })
            Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = role + suffix + "@example.test", password, rememberMe = true })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, "/api/auth/select-tenant", new { tenantId })).StatusCode);
        var root = $"/api/tenants/{tenantId}"; var url = root + "/organization-items/permission-grades";
        var defaults = (await master.GetFromJsonAsync<List<PermissionGradeView>>(url))!;
        Assert.Equal(2, defaults.Count);
        var original = (await master.GetFromJsonAsync<Settings>(root + "/permissions"))!;
        var create = await AuthTests.Post(master, url, new { name = "입고 담당자", isActive = true });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var grade = (await create.Content.ReadFromJsonAsync<PermissionGradeView>())!;
        Assert.False(grade.IsBuiltIn);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(master, url, new { name = " 입고 담당자 ", isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, url, new { name = "권한 상승", isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await master.GetAsync($"/api/tenants/{foreignId}/organization-items/permission-grades")).StatusCode);
        var settings = (await master.GetFromJsonAsync<Settings>(root + "/permissions"))!;
        Assert.All(settings.Roles[grade.Id].Values, Assert.Empty);
        Assert.Equal(original.Roles["Employee"]["products"], settings.Roles["Employee"]["products"]);
        async Task<EmployeeView> Member() => (await master.GetFromJsonAsync<System.Text.Json.JsonElement>(root + "/users")).GetProperty("items").EnumerateArray().Select(x => x.DeserializeEmployee()).Single(x => x.UserId == employeeId);
        var member = await Member();
        var assignment = new { member.Version, name = member.Name, role = "Employee", isActive = true, permissionGradeId = Guid.Parse(grade.Id) };
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(administrator, root + "/users/" + employeeId, assignment)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/users/" + employeeId, assignment)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/receipts")).StatusCode);
        settings.Roles[grade.Id]["receipts"] = ["menu", "read", "create"];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/permissions", settings)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root + "/receipts")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(employee, root + "/receipts", new {})).StatusCode); // authorized, invalid business payload
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/shipments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/pages/shipments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/users/master-transfer")).StatusCode);
        settings = (await master.GetFromJsonAsync<Settings>(root + "/permissions"))!;
        settings.Roles[grade.Id]["receipts"] = ["menu", "read"];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/permissions", settings)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(employee, root + "/receipts", new {})).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root + "/receipts")).StatusCode);
        var renamed = await AuthTests.Post(master, url + "/" + grade.Id, new { grade.Version, name = "입고·검수 담당자", isActive = true });
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode); grade = (await renamed.Content.ReadFromJsonAsync<PermissionGradeView>())!;
        Assert.Equal(Guid.Parse(grade.Id), (await Member()).PermissionGradeId);
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(master, url + "/" + grade.Id, new { grade.Version, name = grade.Name, isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root + "/receipts")).StatusCode);
        // Legacy employee updates which omit the new field must retain the custom assignment.
        member = await Member();
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/users/" + employeeId, new { member.Version, name = member.Name, role = "Employee", isActive = true })).StatusCode);
        Assert.Equal(Guid.Parse(grade.Id), (await Member()).PermissionGradeId);
        Guid foreignGrade;
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var row = new PermissionGrade { TenantId = foreignId, Name = "타 기업", NormalizedName = "타 기업" }; db.Add(row); await db.SaveChangesAsync(); foreignGrade = row.Id;
        }
        member = await Member();
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(master, root + "/users/" + employeeId, new { member.Version, name = member.Name, role = "Employee", isActive = true, permissionGradeId = foreignGrade })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AuthTests.Post(master, url + "/" + foreignGrade, new { name = "변조", isActive = true })).StatusCode);
        // A permission-guarded legacy manager endpoint accepts a delegated grade; master-only endpoints never do.
        settings = (await master.GetFromJsonAsync<Settings>(root + "/permissions"))!;
        settings.Roles[grade.Id]["organization-items"] = ["menu", "read"];
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/permissions", settings)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root + "/organization-items")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync(root + "/users/master-transfer")).StatusCode);
        member = await Member();
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(master, root + "/users/" + employeeId, new { member.Version, name = member.Name, role = "Master", isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(master, root + "/users/" + employeeId, new { member.Version, name = member.Name, role = "Administrator", isActive = true, permissionGradeId = Guid.Parse(grade.Id) })).StatusCode);
        // Deactivate an unused grade, retaining its ID, grants and audit history; new assignments are rejected.
        var unusedResponse = await AuthTests.Post(master, url, new { name = "미사용 담당자", isActive = true });
        var unused = (await unusedResponse.Content.ReadFromJsonAsync<PermissionGradeView>())!;
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, url + "/" + unused.Id, new { unused.Version, name = unused.Name, isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(master, root + "/users/" + employeeId, new { member.Version, name = member.Name, role = "Employee", isActive = true, permissionGradeId = Guid.Parse(unused.Id) })).StatusCode);
        var newEmployee = await AuthTests.Post(master, root + "/users", new { name = "신규 담당자", loginId = "new" + suffix, email = "new" + suffix + "@example.test", role = "Employee", isActive = true, permissionGradeId = Guid.Parse(grade.Id) });
        Assert.Equal(HttpStatusCode.Created, newEmployee.StatusCode);
        var created = await newEmployee.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(Guid.Parse(grade.Id), created.GetProperty("user").GetProperty("permissionGradeId").GetGuid());
        // Built-in rename retains the same identifier and saved grants; no membership rewrites.
        var built = defaults.Single(x => x.Id == "Administrator");
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, url + "/Administrator", new { built.Version, name = "운영 관리자", isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(master, url, new { name = "기업 마스터", isActive = true })).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            Assert.True(await db.OrganizationChanges.AnyAsync(x => x.TenantId == tenantId && x.Action == "PermissionGradeUpdated"));
            Assert.Equal(3, await db.TenantPermissionChanges.CountAsync(x => x.TenantId == tenantId));
            Assert.Single(await db.TenantMemberships.Where(x => x.TenantId == tenantId && x.Role == TenantRole.Master).ToListAsync());
            Assert.Equal(TenantRole.Employee, (await db.TenantMemberships.SingleAsync(x => x.TenantId == tenantId && x.UserId == employeeId)).Role);
        }
        var transfer = await master.GetFromJsonAsync<System.Text.Json.JsonElement>(root + "/users/master-transfer");
        var target = transfer.GetProperty("candidates").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == employeeId);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(master, root + "/users/master-transfer", new {
            targetUserId = employeeId, currentMasterVersion = transfer.GetProperty("currentMasterVersion").GetGuid(), targetVersion = target.GetProperty("version").GetGuid(), currentPassword = password, reason = "격리 QA 명시적 마스터 위임"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await employee.GetAsync(root + "/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await master.GetAsync(root + "/permissions")).StatusCode);
        using var finalScope = factory.Services.CreateScope();
        var promoted = await finalScope.ServiceProvider.GetRequiredService<WmsDbContext>().TenantMemberships.SingleAsync(x => x.TenantId == tenantId && x.UserId == employeeId);
        Assert.Equal(TenantRole.Master, promoted.Role); Assert.Null(promoted.PermissionGradeId);
    }
}
internal static class GradeTestJson
{
    public static EmployeeView DeserializeEmployee(this System.Text.Json.JsonElement element) => System.Text.Json.JsonSerializer.Deserialize<EmployeeView>(element.GetRawText(), new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
}
