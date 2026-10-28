using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Data;

// Global identity/control-plane store. Tenant business queries must explicitly scope by TenantId.
public sealed class WmsDbContext(
    DbContextOptions<WmsDbContext> options,
    IAuditActor actor,
    TimeProvider clock) : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        var user = builder.Entity<ApplicationUser>();
        user.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
        user.Property(x => x.Email).IsRequired();
        user.Property(x => x.NormalizedEmail).IsRequired();
        user.Property(x => x.UserName).IsRequired();
        user.Property(x => x.NormalizedUserName).IsRequired();
        user.Property(x => x.SystemRole).HasConversion<string>().HasMaxLength(32).IsRequired();
        user.HasIndex(x => x.NormalizedEmail).IsUnique().HasDatabaseName("EmailIndex");
        user.ToTable("AspNetUsers", t => t.HasCheckConstraint("CK_Users_SystemRole",
            "\"SystemRole\" IN ('None', 'IebleAdministrator')"));

        var tenant = builder.Entity<Tenant>();
        tenant.ToTable("Tenants", t =>
        {
            t.HasCheckConstraint("CK_Tenants_Code", "length(trim(\"Code\")) > 0 AND \"Code\" = upper(trim(\"Code\"))");
            t.HasCheckConstraint("CK_Tenants_Name", "length(trim(\"Name\")) > 0");
        });
        tenant.HasKey(x => x.Id);
        tenant.Property(x => x.Code).HasMaxLength(64).IsRequired();
        tenant.Property(x => x.Name).HasMaxLength(200).IsRequired();
        tenant.HasIndex(x => x.Code).IsUnique();
        tenant.Property(x => x.Version).IsConcurrencyToken();

        var membership = builder.Entity<TenantMembership>();
        membership.ToTable("TenantMemberships", t => t.HasCheckConstraint("CK_Memberships_Role",
            "\"Role\" IN ('Employee', 'Administrator', 'Master')"));
        membership.HasKey(x => new { x.TenantId, x.UserId });
        membership.Property(x => x.Role).HasConversion<string>().HasMaxLength(32).IsRequired();
        membership.Property(x => x.Version).IsConcurrencyToken();
        membership.HasIndex(x => new { x.UserId, x.IsActive });
        membership.HasIndex(x => new { x.TenantId, x.Role, x.IsActive });
        membership.HasOne(x => x.Tenant).WithMany(x => x.Memberships)
            .HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        membership.HasOne(x => x.User).WithMany(x => x.Memberships)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);

        ConfigureAudit<ApplicationUser>(builder);
        ConfigureAudit<Tenant>(builder);
        ConfigureAudit<TenantMembership>(builder);
    }

    private static void ConfigureAudit<TEntity>(ModelBuilder builder) where TEntity : class, IAuditableEntity
    {
        var entity = builder.Entity<TEntity>();
        entity.Property(x => x.CreatedAt).IsRequired();
        entity.Property(x => x.UpdatedAt).IsRequired();
        entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UpdatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyAudit();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyAudit();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void ApplyAudit()
    {
        var now = clock.GetUtcNow();
        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.CreatedByUserId = actor.UserId;
            }
            else
            {
                entry.Property(x => x.CreatedAt).IsModified = false;
                entry.Property(x => x.CreatedByUserId).IsModified = false;
            }
            entry.Entity.UpdatedAt = now;
            entry.Entity.UpdatedByUserId = actor.UserId;
            if (entry.Entity is AuditableEntity versioned) versioned.Version = Guid.NewGuid();
            if (entry.Entity is ApplicationUser user) user.ConcurrencyStamp = Guid.NewGuid().ToString();
        }
    }
}
