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

    public DbSet<TenantStatusChange> TenantStatusChanges => Set<TenantStatusChange>();
    public DbSet<AdministratorBootstrap> AdministratorBootstraps => Set<AdministratorBootstrap>();

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
            t.HasCheckConstraint("CK_Tenants_BusinessRegistrationNumber", "\"BusinessRegistrationNumber\" IS NULL OR (length(\"BusinessRegistrationNumber\") = 10 AND replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(\"BusinessRegistrationNumber\", '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = '')");
            t.HasCheckConstraint("CK_Tenants_ServiceStatus", "\"ServiceStatus\" IN ('Active', 'Suspended')");
            t.HasCheckConstraint("CK_Tenants_BillingStatus", "\"BillingStatus\" IN ('CardRequired', 'PaymentRequired', 'Paid')");
            t.HasCheckConstraint("CK_Tenants_Name", "length(trim(\"Name\")) > 0");
        });
        tenant.HasKey(x => x.Id);
        tenant.Property(x => x.Code).HasMaxLength(64).IsRequired();
        tenant.Property(x => x.Name).HasMaxLength(200).IsRequired();
        tenant.Property(x => x.BusinessRegistrationNumber).HasMaxLength(10);
        tenant.HasIndex(x => x.BusinessRegistrationNumber).IsUnique();
        tenant.Property(x => x.ServiceStatus).HasConversion<string>().HasMaxLength(32).IsRequired();
        tenant.Property(x => x.BillingStatus).HasConversion<string>().HasMaxLength(32).IsRequired();
        tenant.HasIndex(x => x.Code).IsUnique();
        tenant.Property(x => x.Version).IsConcurrencyToken();

        var membership = builder.Entity<TenantMembership>();
        membership.ToTable("TenantMemberships", t => t.HasCheckConstraint("CK_Memberships_Role",
            "\"Role\" IN ('Employee', 'Administrator', 'Master')"));
        membership.HasKey(x => new { x.TenantId, x.UserId });
        membership.Property(x => x.Role).HasConversion<string>().HasMaxLength(32).IsRequired();
        membership.Property(x => x.Version).IsConcurrencyToken();
        membership.HasIndex(x => x.UserId).IsUnique().HasDatabaseName("IX_TenantMemberships_DefaultUser").HasFilter("\"IsDefault\" = TRUE");
        membership.HasIndex(x => new { x.UserId, x.IsActive });
        membership.HasIndex(x => new { x.TenantId, x.Role, x.IsActive });
        membership.HasOne(x => x.Tenant).WithMany(x => x.Memberships)
            .HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        membership.HasOne(x => x.User).WithMany(x => x.Memberships)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);

        var history = builder.Entity<TenantStatusChange>();
        history.ToTable("TenantStatusChanges", t =>
        {
            t.HasCheckConstraint("CK_TenantStatusChanges_Transition", "(\"FromStatus\" = 'PendingActivation' AND \"ToStatus\" IN ('Active', 'Rejected')) OR (\"FromStatus\" = 'Active' AND \"ToStatus\" = 'Suspended') OR (\"FromStatus\" = 'Suspended' AND \"ToStatus\" = 'Active')");
            t.HasCheckConstraint("CK_TenantStatusChanges_Reason", "length(trim(\"Reason\")) > 0");
        });
        history.HasKey(x => x.Id);
        history.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(32);
        history.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(32);
        history.Property(x => x.Reason).HasMaxLength(1000).IsRequired();
        history.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        history.HasOne(x => x.ChangedByUser).WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
        history.HasIndex(x => new { x.TenantId, x.Id });
        var bootstrap = builder.Entity<AdministratorBootstrap>();
        bootstrap.ToTable("AdministratorBootstraps", t => t.HasCheckConstraint("CK_AdministratorBootstraps_Singleton", "\"Id\" = 1"));
        bootstrap.HasKey(x => x.Id);
        bootstrap.Property(x => x.Id).ValueGeneratedNever();
        bootstrap.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);

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
        if (ChangeTracker.Entries().Any(x => (x.Entity is TenantStatusChange or AdministratorBootstrap) && x.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Administrative history and bootstrap receipts are immutable.");
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
