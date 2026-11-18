using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Data;

// Global identity/control-plane store. Tenant business queries must explicitly scope by TenantId.
public sealed partial class WmsDbContext(
    DbContextOptions<WmsDbContext> options,
    IAuditActor actor,
    TimeProvider clock) : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<BusinessCodeCounter> BusinessCodeCounters => Set<BusinessCodeCounter>();
    public DbSet<CompanyLogo> CompanyLogos => Set<CompanyLogo>();
    public DbSet<DevelopmentAccessGrant> DevelopmentAccessGrants => Set<DevelopmentAccessGrant>();
    public DbSet<DevelopmentAccessChange> DevelopmentAccessChanges => Set<DevelopmentAccessChange>();
    public DbSet<Stocktake> Stocktakes => Set<Stocktake>();
    public DbSet<StocktakeTarget> StocktakeTargets => Set<StocktakeTarget>();
    public DbSet<StocktakeChange> StocktakeChanges => Set<StocktakeChange>();
    public DbSet<InventoryOperation> InventoryOperations => Set<InventoryOperation>();
    public DbSet<InventoryChange> InventoryChanges => Set<InventoryChange>();
    public DbSet<OutboundShipment> OutboundShipments => Set<OutboundShipment>();
    public DbSet<OutboundShipmentLine> OutboundShipmentLines => Set<OutboundShipmentLine>();
    public DbSet<ShipmentAllocation> ShipmentAllocations => Set<ShipmentAllocation>();
    public DbSet<ShipmentChange> ShipmentChanges => Set<ShipmentChange>();
    public DbSet<InboundReceipt> InboundReceipts => Set<InboundReceipt>();
    public DbSet<InboundReceiptLine> InboundReceiptLines => Set<InboundReceiptLine>();
    public DbSet<StockBalance> StockBalances => Set<StockBalance>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<ReceiptChange> ReceiptChanges => Set<ReceiptChange>();
    public DbSet<Partner> Partners => Set<Partner>();
    public DbSet<PartnerChange> PartnerChanges => Set<PartnerChange>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductType> ProductTypes => Set<ProductType>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<ProductChange> ProductChanges => Set<ProductChange>();
    public DbSet<SupportAttachment> SupportAttachments => Set<SupportAttachment>();
    public DbSet<SupportChange> SupportChanges => Set<SupportChange>();
    public DbSet<BillingFeedback> BillingFeedbacks => Set<BillingFeedback>();
    public DbSet<BillingReminderDismissal> BillingReminderDismissals => Set<BillingReminderDismissal>();
    public DbSet<BillingInvoice> BillingInvoices => Set<BillingInvoice>();
    public DbSet<BillingChange> BillingChanges => Set<BillingChange>();
    public DbSet<StorageBarcode> StorageBarcodes => Set<StorageBarcode>();
    public DbSet<WarehouseSaveReceipt> WarehouseSaveReceipts => Set<WarehouseSaveReceipt>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<WarehouseTemplate> WarehouseTemplates => Set<WarehouseTemplate>();
    public DbSet<WarehousePlan> WarehousePlans => Set<WarehousePlan>();
    public DbSet<WarehousePlanObject> WarehousePlanObjects => Set<WarehousePlanObject>();
    public DbSet<WarehouseZone> WarehouseZones => Set<WarehouseZone>();
    public DbSet<WarehouseRack> WarehouseRacks => Set<WarehouseRack>();
    public DbSet<StorageLocation> StorageLocations => Set<StorageLocation>();
    public DbSet<WarehouseChange> WarehouseChanges => Set<WarehouseChange>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<JobPosition> JobPositions => Set<JobPosition>();
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<ExternalCollaborator> ExternalCollaborators => Set<ExternalCollaborator>();
    public DbSet<CollaboratorPermissionChange> CollaboratorPermissionChanges => Set<CollaboratorPermissionChange>();
    public DbSet<PermissionGrade> PermissionGrades => Set<PermissionGrade>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();

    public DbSet<TenantStatusChange> TenantStatusChanges => Set<TenantStatusChange>();
    public DbSet<AdministratorBootstrap> AdministratorBootstraps => Set<AdministratorBootstrap>();

    public DbSet<TenantPermissionSettings> TenantPermissionSettings => Set<TenantPermissionSettings>();
    public DbSet<TenantPermissionChange> TenantPermissionChanges => Set<TenantPermissionChange>();

    public DbSet<OrganizationChange> OrganizationChanges => Set<OrganizationChange>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        ConfigureExternalAccountLinks(builder);
        builder.Entity<BusinessCodeCounter>(b => {
            b.HasKey(x => new { x.TenantId, x.Prefix });
            b.Property(x => x.Prefix).HasMaxLength(2);
            b.Property(x => x.LastValue).IsConcurrencyToken();
            b.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<CompanyLogo>(b => {
            b.HasKey(x => x.TenantId);
            b.Property(x => x.FileName).HasMaxLength(160);
            b.Property(x => x.ContentType).HasMaxLength(40);
            b.HasOne<Tenant>().WithOne().HasForeignKey<CompanyLogo>(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        });
        DevelopmentAccessModel.Configure(builder);
        ProductModel.Configure(builder);
        PartnerModel.Configure(builder);
        ReceivingModel.Configure(builder);
        ShippingModel.Configure(builder);
        InventoryModel.Configure(builder);
        StocktakeModel.Configure(builder);
        WarehouseModel.Configure(builder);
        foreach (var type in new[] { typeof(InboundReceipt), typeof(OutboundShipment), typeof(Stocktake), typeof(InventoryOperation), typeof(Warehouse) })
            builder.Entity(type).HasOne(typeof(TenantMembership)).WithMany().HasForeignKey("TenantId", "ContactUserId").OnDelete(DeleteBehavior.Restrict);
        builder.Entity<InventoryOperation>().Property(x => x.ContactName).HasMaxLength(200);
        StorageBarcodeModel.Configure(builder, Database.IsNpgsql());
        WarehousePlanModel.Configure(builder);
        WarehouseTemplateModel.Configure(builder);
        BillingModel.Configure(builder);
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
        tenant.Property(x => x.RepresentativeName).HasMaxLength(200);
        tenant.Property(x => x.Address).HasMaxLength(500);
        tenant.Property(x => x.ContactName).HasMaxLength(200);
        tenant.Property(x => x.ContactPhone).HasMaxLength(30);
        tenant.Property(x => x.BusinessRegistrationNumber).HasMaxLength(10);
        tenant.HasIndex(x => x.BusinessRegistrationNumber).IsUnique();
        tenant.Property(x => x.ServiceStatus).HasConversion<string>().HasMaxLength(32).IsRequired();
        tenant.Property(x => x.BillingStatus).HasConversion<string>().HasMaxLength(32).IsRequired();
        tenant.HasIndex(x => x.Code).IsUnique();
        tenant.Property(x => x.Version).IsConcurrencyToken();

        var department = builder.Entity<Department>();
        department.HasKey(x => new { x.TenantId, x.Id });
        department.Property(x => x.Name).HasMaxLength(100).IsRequired();
        department.Property(x => x.NormalizedName).HasMaxLength(100).IsRequired();
        department.Property(x => x.Version).IsConcurrencyToken();
        department.HasIndex(x => new { x.TenantId, x.NormalizedName }).IsUnique();
        department.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        department.HasOne<Department>().WithMany().HasForeignKey(x => new { x.TenantId, x.ParentId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        department.ToTable("Departments", t => {
            t.HasCheckConstraint("CK_Department_Parent", "\"ParentId\" IS NULL OR \"ParentId\" <> \"Id\"");
            t.HasCheckConstraint("CK_Department_Name", "length(trim(\"Name\")) > 0");
            t.HasCheckConstraint("CK_Department_Order", "\"SortOrder\" >= 0");
        });
        var position = builder.Entity<JobPosition>();
        position.HasKey(x => new { x.TenantId, x.Id });
        position.Property(x => x.Name).HasMaxLength(100).IsRequired();
        position.Property(x => x.NormalizedName).HasMaxLength(100).IsRequired();
        position.Property(x => x.Version).IsConcurrencyToken();
        position.HasIndex(x => new { x.TenantId, x.NormalizedName }).IsUnique();
        position.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        position.ToTable("JobPositions", t => {
            t.HasCheckConstraint("CK_Position_Name", "length(trim(\"Name\")) > 0");
            t.HasCheckConstraint("CK_Position_Order", "\"SortOrder\" >= 0");
        });
        ConfigureCollaborators(builder);
        var grade = builder.Entity<PermissionGrade>();
        grade.HasKey(x => x.Id);
        grade.HasAlternateKey(x => new { x.TenantId, x.Id });
        grade.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        grade.Property(x => x.Name).HasMaxLength(100).IsRequired();
        grade.Property(x => x.NormalizedName).HasMaxLength(100).IsRequired();
        grade.Property(x => x.Description).HasMaxLength(500);
        grade.Property(x => x.SystemRole).HasMaxLength(32);
        grade.Property(x => x.Version).IsConcurrencyToken();
        grade.HasIndex(x => new { x.TenantId, x.NormalizedName }).IsUnique();
        grade.HasIndex(x => new { x.TenantId, x.SystemRole }).IsUnique();
        grade.ToTable("PermissionGrades", t => t.HasCheckConstraint("CK_PermissionGrade_SystemRole", "\"SystemRole\" IS NULL OR \"SystemRole\" IN ('Administrator','Employee')"));
        var membership = builder.Entity<TenantMembership>();
        membership.HasOne<PermissionGrade>().WithMany().HasForeignKey(x => new { x.TenantId, x.PermissionGradeId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        membership.ToTable("TenantMemberships", t => t.HasCheckConstraint("CK_Memberships_PermissionGrade", "\"PermissionGradeId\" IS NULL OR (\"AccountType\" = 'Internal' AND \"Role\" = 'Employee')"));
        membership.HasOne(x => x.Collaborator).WithMany().HasForeignKey(x => new { x.TenantId, x.CollaboratorId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        membership.ToTable("TenantMemberships", t => t.HasCheckConstraint("CK_Memberships_Collaborator", "(\"AccountType\" = 'External' AND \"CollaboratorId\" IS NOT NULL) OR (\"AccountType\" = 'Internal' AND \"CollaboratorId\" IS NULL)"));
        membership.ToTable("TenantMemberships", t => t.HasCheckConstraint("CK_Memberships_Role",
            "\"Role\" IN ('Employee', 'Administrator', 'Master')"));
        membership.HasKey(x => new { x.TenantId, x.UserId });
        membership.HasIndex(x => x.TenantId).IsUnique().HasDatabaseName("IX_TenantMemberships_OneActiveMaster").HasFilter("\"Role\" = 'Master' AND \"IsActive\" = TRUE");
        membership.HasOne<Department>().WithMany().HasForeignKey(x => new { x.TenantId, x.DepartmentId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        membership.HasOne<JobPosition>().WithMany().HasForeignKey(x => new { x.TenantId, x.PositionId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        membership.Property(x => x.AccountType).HasMaxLength(16).HasDefaultValue("Internal").IsRequired();
        membership.Property(x => x.CompanyName).HasMaxLength(200);
        membership.Property(x => x.BusinessRegistrationNumber).HasMaxLength(64);
        membership.Property(x => x.CompanyPhone).HasMaxLength(50);
        membership.Property(x => x.ContactPhone).HasMaxLength(50);
        membership.Property(x => x.ContactEmail).HasMaxLength(256);
        membership.Property(x => x.ExternalPermissionsJson).HasDefaultValue("{}").IsRequired();
        membership.HasIndex(x => new { x.TenantId, x.AccountType, x.IsActive });
        membership.HasOne<Partner>().WithMany().HasForeignKey(x => new { x.TenantId, x.PartnerId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        membership.ToTable("TenantMemberships", t => {
            t.HasCheckConstraint("CK_Memberships_AccountType", "\"AccountType\" IN ('Internal','External')");
            t.HasCheckConstraint("CK_Memberships_External", "\"AccountType\" <> 'External' OR (\"Role\" = 'Employee' AND \"DepartmentId\" IS NULL AND \"PositionId\" IS NULL AND \"CompanyName\" IS NOT NULL AND length(trim(\"CompanyName\")) > 0)");
        });
        membership.Property(x => x.DisplayName).HasMaxLength(200);
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

        var permissions = builder.Entity<TenantPermissionSettings>();
        permissions.HasKey(x => x.TenantId);
        permissions.Property(x => x.RolesJson).IsRequired();
        permissions.Property(x => x.Version).IsConcurrencyToken();
        permissions.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        permissions.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        var permissionHistory = builder.Entity<TenantPermissionChange>();
        permissionHistory.HasKey(x => x.Id);
        permissionHistory.Property(x => x.BeforeJson).IsRequired();
        permissionHistory.Property(x => x.AfterJson).IsRequired();
        permissionHistory.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        permissionHistory.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
        permissionHistory.HasIndex(x => new { x.TenantId, x.Id });

        var organizationHistory = builder.Entity<OrganizationChange>();
        organizationHistory.HasKey(x => x.Id);
        organizationHistory.Property(x => x.Action).HasMaxLength(64).IsRequired();
        organizationHistory.Property(x => x.Reason).HasMaxLength(500);
        organizationHistory.Property(x => x.BeforeJson).IsRequired();
        organizationHistory.Property(x => x.AfterJson).IsRequired();
        organizationHistory.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        organizationHistory.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.TargetUserId).OnDelete(DeleteBehavior.Restrict);
        organizationHistory.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
        organizationHistory.HasIndex(x => new { x.TenantId, x.Id });

        ConfigureAudit<ApplicationUser>(builder);
        ConfigureAudit<Tenant>(builder);
        ConfigureAudit<TenantMembership>(builder);
        ConfigureAudit<PermissionGrade>(builder);
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

    private readonly HashSet<Guid> unusedProductDeletions = [];
    internal void AllowUnusedProductDeletion(IEnumerable<Guid> ids) => unusedProductDeletions.UnionWith(ids);

    private void ApplyAudit()
    {
        if (ChangeTracker.Entries().Any(x => (x.Entity is TenantStatusChange or AdministratorBootstrap or TenantPermissionChange or OrganizationChange or WarehouseChange or ProductChange or PartnerChange or ReceiptChange or ShipmentChange or StocktakeChange or InventoryOperation or InventoryChange or StockMovement or DevelopmentAccessChange or BillingChange or SupportChange or SupportAttachment) && x.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Administrative history and bootstrap receipts are immutable.");
        foreach (var entry in ChangeTracker.Entries<BillingFeedback>())
            if (entry.State == EntityState.Deleted || (entry.State == EntityState.Modified &&
                new[] { "TenantId", "UserId", "RequestId", "Message", "Title", "Category", "Number", "CreatedAt", "RequestHash" }.Any(p => entry.Property(p).IsModified)))
                throw new InvalidOperationException("Original inquiries are immutable.");
        foreach (var entry in ChangeTracker.Entries<Warehouse>().Where(x => x.State == EntityState.Modified))
            if (entry.Property(x => x.Code).IsModified) throw new InvalidOperationException("System warehouse codes are immutable.");
        foreach (var entry in ChangeTracker.Entries<BillingInvoice>().Where(x => x.State is EntityState.Modified or EntityState.Deleted))
            if (entry.State == EntityState.Deleted || entry.Property(x => x.AmountKrw).IsModified || entry.Property(x => x.UserCount).IsModified || entry.Property(x => x.CycleStart).IsModified || entry.Property(x => x.CycleEnd).IsModified || entry.Property(x => x.IdempotencyKey).IsModified || entry.Property(x => x.TenantId).IsModified)
                throw new InvalidOperationException("Finalized invoice amounts and periods are immutable.");
        if (ChangeTracker.Entries<Partner>().Any(x => x.State == EntityState.Deleted))
            throw new InvalidOperationException("Partners are deactivated, never deleted.");
        foreach (var entry in ChangeTracker.Entries<Product>())
        {
            if (entry.State == EntityState.Deleted && (!unusedProductDeletions.Contains(entry.Entity.Id) || entry.Entity.TrackingLockedAt.HasValue)) throw new InvalidOperationException("Product deletion requires unused-product validation.");
            if (entry.State == EntityState.Modified && entry.Property(x => x.TrackingLockedAt).OriginalValue != null &&
                (entry.Property(x => x.TrackingLockedAt).IsModified || entry.Property(x => x.Unit).IsModified || entry.Property(x => x.LotManaged).IsModified || entry.Property(x => x.ExpiryManaged).IsModified || entry.Property(x => x.SerialManaged).IsModified))
                throw new InvalidOperationException("Used product tracking policy and unit are immutable.");
        }
        foreach (var entry in ChangeTracker.Entries<InboundReceipt>())
            if (entry.State == EntityState.Deleted || (entry.State == EntityState.Modified && entry.Property(x => x.Status).OriginalValue is "Confirmed" or "Cancelled"))
                throw new InvalidOperationException("Finalized receipts cannot be changed or deleted.");
        foreach (var entry in ChangeTracker.Entries<OutboundShipment>())
            if (entry.State == EntityState.Deleted || (entry.State == EntityState.Modified && entry.Property(x => x.Status).OriginalValue is "Confirmed" or "Cancelled"))
                throw new InvalidOperationException("Finalized shipments cannot be changed or deleted.");
        foreach (var entry in ChangeTracker.Entries<Stocktake>())
            if (entry.State == EntityState.Deleted || (entry.State == EntityState.Modified && entry.Property(x => x.Status).OriginalValue is "Confirmed" or "Cancelled"))
                throw new InvalidOperationException("Finalized stocktakes are immutable.");
        foreach (var entry in ChangeTracker.Entries<StocktakeTarget>())
            if (entry.State == EntityState.Deleted || (entry.State == EntityState.Modified && new[]{"OriginalQuantity","OriginalReserved","OriginalSnapshotAt"}.Any(p=>entry.Property(p).IsModified)))
                throw new InvalidOperationException("Original count snapshots are immutable.");
        var now = clock.GetUtcNow();
        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified)) continue;
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = entry.Entity is Tenant { BillingPolicyVersion: 2, TrialStartedAt: DateTimeOffset signedUpAt }
                    ? signedUpAt : now;
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
