using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class MasterContactTests
{
    [Fact]
    public async Task SignupPhoneAndMasterContactPersistWithoutChangingIdentityOrCompany()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        const string phone = "010-1234-5678", email = "master@contact.test";
        var password = "Master1!" + Guid.NewGuid().ToString("N");
        var signup = await AuthTests.Post(c, "/api/auth/register", new { loginId = "contactmaster", email, companyName = "연락처 QA", businessRegistrationNumber = "1234567890", contactName = "마스터", contactPhone = phone, password });
        Assert.Equal(HttpStatusCode.Created, signup.StatusCode);
        Guid tenant, user, otherTenant, otherUser; string identityBefore;
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var m = await db.TenantMemberships.Include(x => x.User).SingleAsync(); tenant = m.TenantId; user = m.UserId;
            Assert.Equal(phone, m.ContactPhone); Assert.Equal(phone, m.User.PhoneNumber);
            (await db.Tenants.SingleAsync()).BillingStatus = TenantBillingStatus.Paid;
            identityBefore = JsonSerializer.Serialize(new { m.User.PhoneNumber, m.User.PasswordHash, m.User.SecurityStamp, m.User.Email, m.User.UserName, m.User.MustChangePassword });
            var t = new Tenant { Code = "OTHER", Name = "다른 기업", BillingStatus = TenantBillingStatus.Paid }; otherTenant = t.Id;
            db.Add(new TenantMembership { Tenant = t, UserId = user, ContactPhone = "02-9999-0000" });
            var u = new ApplicationUser { UserName = "another", NormalizedUserName = "ANOTHER", Email = "other@contact.test", NormalizedEmail = "OTHER@CONTACT.TEST", DisplayName = "다른 사용자" }; otherUser = u.Id;
            db.Add(new TenantMembership { TenantId = tenant, User = u, Role = TenantRole.Employee });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/login", new { email, password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, "/api/auth/select-tenant", new { tenantId = tenant })).StatusCode);
        var root = $"/api/tenants/{tenant}/users"; var url = $"{root}/{user}/organization";
        async Task<JsonElement> Master()
        {
            var response = await c.GetAsync(root); Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()} me={await c.GetStringAsync("/api/auth/me")}");
            var list = await response.Content.ReadFromJsonAsync<JsonElement>();
            return list.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == user);
        }
        var current = await Master(); Assert.Equal(phone, current.GetProperty("contactPhone").GetString()); Assert.Equal(email, current.GetProperty("email").GetString());
        var oldVersion = current.GetProperty("version").GetGuid();
        var response = await AuthTests.Post(c, url, new { version = oldVersion, contactPhone = " 010-5555-8888 " });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        current = await Master(); Assert.Equal("010-5555-8888", current.GetProperty("contactPhone").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, url, new { version = oldVersion, contactPhone = "010-9999-0000" })).StatusCode);
        var version = current.GetProperty("version").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url, new { version, contactPhone = "not a phone" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url, new { version, contactPhone = "010\n1234" })).StatusCode);
        // Strict DTO prevents account/security mutations through the master-only contact endpoint.
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url, new { version, role = "Employee", contactPhone = phone })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, url, new { version, password = "NotAllowed1!" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"{root}/{otherUser}/organization", new { version, contactPhone = phone })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"/api/tenants/{otherTenant}/users/{user}/organization", new { version, contactPhone = phone })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, $"{root}/{user}", new { version, name = "changed", role = "Employee", isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, url, new { version })).StatusCode);
        Assert.Equal("010-5555-8888", (await Master()).GetProperty("contactPhone").GetString());
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(c, url, new { version, contactPhone = (string?)null })).StatusCode);
        Assert.Equal("", (await Master()).GetProperty("contactPhone").GetString());
        // Legacy signup data: only the same identity's phone is a fallback, never company/other member contact.
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var m = await db.TenantMemberships.SingleAsync(x => x.TenantId == tenant && x.UserId == user);
            m.ContactPhone = null; await db.SaveChangesAsync();
        }
        Assert.Equal(phone, (await Master()).GetProperty("contactPhone").GetString());
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>(); var u = await db.Users.SingleAsync(x => x.Id == user);
            Assert.Equal(identityBefore, JsonSerializer.Serialize(new { u.PhoneNumber, u.PasswordHash, u.SecurityStamp, u.Email, u.UserName, u.MustChangePassword }));
            Assert.Equal(phone, (await db.Tenants.SingleAsync(x => x.Id == tenant)).ContactPhone);
            Assert.Equal("02-9999-0000", (await db.TenantMemberships.SingleAsync(x => x.TenantId == otherTenant)).ContactPhone);
            Assert.Equal(TenantRole.Master, (await db.TenantMemberships.SingleAsync(x => x.TenantId == tenant && x.UserId == user)).Role);
            u.PhoneNumber = null; await db.SaveChangesAsync();
        }
        Assert.Equal(JsonValueKind.Null, (await Master()).GetProperty("contactPhone").ValueKind);
    }
}
