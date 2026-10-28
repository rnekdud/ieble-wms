using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace IebleWms.Api.Tests;

public sealed class DataTests : IDisposable
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly TestActor actor = new();
    private readonly TestClock clock = new();
    private readonly WmsDbContext db;

    public DataTests()
    {
        connection.Open();
        db = NewContext();
        db.Database.EnsureCreated(); // Isolated in-memory SQLite only; never the development PostgreSQL DB.
    }

    private WmsDbContext NewContext() => new(
        new DbContextOptionsBuilder<WmsDbContext>().UseSqlite(connection).Options, actor, clock);

    private static ApplicationUser User(string name = "employee") => new()
    {
        DisplayName = name, UserName = name, NormalizedUserName = name.ToUpperInvariant(),
        Email = name + "@example.test", NormalizedEmail = name.ToUpperInvariant() + "@EXAMPLE.TEST"
    };

    [Fact]
    public async Task RolesAreScopedToMembershipAndPlatformAuthorityIsSeparate()
    {
        var user = User();
        var platform = User("support");
        platform.SystemRole = SystemRole.IebleAdministrator;
        var a = new Tenant { Code = "A", Name = "A" };
        var b = new Tenant { Code = "B", Name = "B" };
        db.AddRange(new TenantMembership { User = user, Tenant = a, Role = TenantRole.Master },
            new TenantMembership { User = user, Tenant = b, Role = TenantRole.Employee }, platform);
        await db.SaveChangesAsync();
        var access = new MembershipAccessService(db);
        Assert.Equal(TenantRole.Master, await access.GetTenantRoleAsync(user.Id, a.Id));
        Assert.Equal(TenantRole.Employee, await access.GetTenantRoleAsync(user.Id, b.Id));
        Assert.Null(await access.GetTenantRoleAsync(user.Id, Guid.NewGuid()));
        Assert.False(await access.IsIebleAdministratorAsync(user.Id));
        Assert.True(await access.IsIebleAdministratorAsync(platform.Id));
        Assert.Null(await access.GetTenantRoleAsync(platform.Id, a.Id));
        platform.IsActive = false;
        await db.SaveChangesAsync();
        Assert.False(await access.IsIebleAdministratorAsync(platform.Id));
    }

    [Theory]
    [InlineData("user")]
    [InlineData("tenant")]
    [InlineData("membership")]
    public async Task InactiveRecordsDenyTenantAccess(string target)
    {
        var membership = new TenantMembership { User = User(), Tenant = new Tenant { Code = "A", Name = "A" } };
        db.Add(membership);
        await db.SaveChangesAsync();
        if (target == "user") membership.User.IsActive = false;
        if (target == "tenant") membership.Tenant.IsActive = false;
        if (target == "membership") membership.IsActive = false;
        await db.SaveChangesAsync();
        Assert.Null(await new MembershipAccessService(db).GetTenantRoleAsync(membership.UserId, membership.TenantId));
    }

    [Theory]
    [InlineData("code")]
    [InlineData("email")]
    [InlineData("username")]
    [InlineData("membership")]
    [InlineData("role")]
    [InlineData("systemRole")]
    [InlineData("foreignKey")]
    public async Task DatabaseRejectsInvalidOrDuplicateRecords(string target)
    {
        var user = User();
        var tenant = new Tenant { Code = "A", Name = "A" };
        db.Add(new TenantMembership { User = user, Tenant = tenant });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        switch (target)
        {
            case "code": db.Add(new Tenant { Code = "A", Name = "Duplicate" }); break;
            case "email":
                var duplicateEmail = User("another");
                duplicateEmail.NormalizedEmail = user.NormalizedEmail;
                db.Add(duplicateEmail); break;
            case "username":
                var duplicateName = User("another");
                duplicateName.NormalizedUserName = user.NormalizedUserName;
                db.Add(duplicateName); break;
            case "membership": db.Add(new TenantMembership { UserId = user.Id, TenantId = tenant.Id }); break;
            case "role": db.Add(new TenantMembership { User = User("other"), TenantId = tenant.Id, Role = (TenantRole)99 }); break;
            case "systemRole":
                var invalidUser = User("invalid");
                invalidUser.SystemRole = (SystemRole)99;
                db.Add(invalidUser); break;
            case "foreignKey": db.Add(new TenantMembership { UserId = Guid.NewGuid(), TenantId = tenant.Id }); break;
        }
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task AuditUsesServerTimeAndActorAndPreservesCreationFields()
    {
        var user = User();
        db.Add(user);
        await db.SaveChangesAsync();
        actor.UserId = user.Id;
        var tenant = new Tenant { Code = "A", Name = "A" };
        db.Add(tenant);
        db.SaveChanges();
        var created = tenant.CreatedAt;
        var version = tenant.Version;
        Assert.Equal(actor.UserId, tenant.CreatedByUserId);
        clock.Now = clock.Now.AddHours(1);
        tenant.Name = "Updated";
        tenant.CreatedAt = DateTimeOffset.MinValue;
        tenant.CreatedByUserId = null;
        await db.SaveChangesAsync();
        await db.Entry(tenant).ReloadAsync();
        Assert.Equal(created, tenant.CreatedAt);
        Assert.Equal(actor.UserId, tenant.CreatedByUserId);
        Assert.Equal(clock.Now, tenant.UpdatedAt);
        Assert.Equal(actor.UserId, tenant.UpdatedByUserId);
        Assert.NotEqual(version, tenant.Version);
    }

    [Fact]
    public async Task ConcurrentTenantUpdatesAreRejected()
    {
        var tenant = new Tenant { Code = "A", Name = "A" };
        db.Add(tenant);
        await db.SaveChangesAsync();
        using var other = NewContext();
        var stale = await other.Tenants.SingleAsync();
        tenant.Name = "First";
        await db.SaveChangesAsync();
        stale.Name = "Second";
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => other.SaveChangesAsync());
    }

    [Fact]
    public async Task DeletingTenantWithMembershipIsRestricted()
    {
        var tenant = new Tenant { Code = "A", Name = "A" };
        db.Add(new TenantMembership { User = User(), Tenant = tenant });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        db.Remove(new Tenant { Id = tenant.Id, Version = tenant.Version });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public async Task IdentityStoresOnlyHashAndVerifiesPasswords()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddWmsData(new ConfigurationBuilder().Build());
        // Use this fixture's isolated relational context with the real registered Identity services.
        services.AddScoped(_ => db);
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var manager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { UserName = "hash-test", Email = "hash@example.test", DisplayName = "Hash test" };
        var password = "Aa1!" + Guid.NewGuid().ToString("N");
        var result = await manager.CreateAsync(user, password);
        Assert.True(result.Succeeded, string.Join(", ", result.Errors.Select(e => e.Description)));
        db.ChangeTracker.Clear();
        var saved = await manager.FindByIdAsync(user.Id.ToString());
        Assert.NotNull(saved);
        Assert.NotEqual(password, saved.PasswordHash);
        Assert.True(await manager.CheckPasswordAsync(saved, password));
        Assert.False(await manager.CheckPasswordAsync(saved, "incorrect"));
    }

    [Fact]
    public void PostgreSqlMigrationCanBeGeneratedWithoutConnection()
    {
        using var context = new WmsDbContextFactory().CreateDbContext([]);
        var script = context.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>().GenerateScript();
        Assert.Contains("CREATE TABLE \"TenantMemberships\"", script);
        Assert.Contains("CK_Memberships_Role", script);
        Assert.Contains("EmailIndex", script);
        Assert.Contains("timestamp with time zone", script);
        Assert.DoesNotContain("CREATE TABLE \"AspNetRoles\"", script);
        Assert.False(context.Database.HasPendingModelChanges());
    }

    public void Dispose() { db.Dispose(); connection.Dispose(); }
    private sealed class TestActor : IAuditActor { public Guid? UserId { get; set; } }
    private sealed class TestClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 10, 28, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
