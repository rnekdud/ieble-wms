using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed class PartnerCodeConcurrencyTests
{
    [ScanPostgresFact]
    public async Task PostgresPartnerAutoCodesAndReplaySerializeAcrossRequests()
    {
        using var f = new ScanPostgresFactory(); using var client = f.Client();
        var suffix = Guid.NewGuid().ToString("N"); var login = "partner-" + suffix; var password = "QA1!" + suffix;
        var tenant = new Tenant { Code = "BP-" + suffix.ToUpperInvariant(), Name = "격리 거래처 QA", BillingStatus = TenantBillingStatus.Paid };
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = login, Email = login + "@qa.test", DisplayName = "격리 QA" };
            Assert.True((await users.CreateAsync(user, password)).Succeeded);
            db.Add(new TenantMembership { Tenant = tenant, User = user, Role = TenantRole.Master });
            db.Add(new Partner { TenantId = tenant.Id, Code = "BP01", NormalizedCode = "BP01", Name = "기존 비활성 거래처", IsActive = false, CreationRequestId = Guid.NewGuid() });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await AuthTests.Post(client, "/api/auth/login", new { email = login, password })).StatusCode);
        var root = $"/api/tenants/{tenant.Id}/partners";
        async Task<JsonElement> Create(Guid requestId)
        {
            var result = await AuthTests.Post(client, root, new { requestId, name = "동시 등록 " + requestId });
            Assert.Equal(HttpStatusCode.Created, result.StatusCode);
            return (await result.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("partner");
        }
        var created = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Create(Guid.NewGuid())));
        Assert.Equal(Enumerable.Range(2, 8).Select(i => $"BP{i:D2}"), created.Select(x => x.GetProperty("code").GetString()).Order());
        var replay = Guid.NewGuid(); var repeated = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Create(replay)));
        Assert.Single(repeated.Select(x => x.GetProperty("id").GetGuid()).Distinct());
        Assert.All(repeated, x => Assert.Equal("BP10", x.GetProperty("code").GetString()));
        var automatic = Create(Guid.NewGuid());
        var manual = AuthTests.Post(client, root, new { requestId = Guid.NewGuid(), code = "BP11", name = "수동 경합" });
        await automatic; var manualResponse = await manual;
        Assert.Contains(manualResponse.StatusCode, new[] { HttpStatusCode.Created, HttpStatusCode.Conflict });
        using var verify = f.Services.CreateScope(); var database = verify.ServiceProvider.GetRequiredService<WmsDbContext>();
        var rows = await database.Partners.AsNoTracking().Where(x => x.TenantId == tenant.Id).ToListAsync();
        Assert.Equal(rows.Count, rows.Select(x => x.NormalizedCode).Distinct().Count());
        Assert.Equal(manualResponse.IsSuccessStatusCode ? 12 : 11, rows.Count);
        Assert.Equal(rows.Count - 1, await database.PartnerChanges.CountAsync(x => x.TenantId == tenant.Id));
        Assert.False(rows.Single(x => x.Code == "BP01").IsActive);
    }
}
