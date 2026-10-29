using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Data;
internal static class BillingModel
{
    public static void Configure(ModelBuilder b)
    {
        b.Entity<Tenant>().Property(x => x.BillingPolicyVersion).HasDefaultValue(1);
        b.Entity<Tenant>().Property(x => x.BillingTimeZone).HasMaxLength(100).HasDefaultValue("Asia/Seoul");
        b.Entity<Tenant>().ToTable("Tenants", t => {
            t.HasCheckConstraint("CK_Tenants_BillingPolicy", "\"BillingPolicyVersion\" IN (1, 2) AND (\"BillingAnchorDay\" IS NULL OR \"BillingAnchorDay\" BETWEEN 1 AND 31)");
            t.HasCheckConstraint("CK_Tenants_Trial", "\"BillingPolicyVersion\" = 1 OR (\"TrialStartedAt\" IS NOT NULL AND \"TrialEndsAt\" > \"TrialStartedAt\" AND \"FirstChargeAt\" >= \"TrialEndsAt\" AND \"BillingAnchorDay\" IS NOT NULL)");
        });
        var f = b.Entity<BillingFeedback>(); f.HasKey(x => x.Id);
        f.Property(x => x.Message).HasMaxLength(2000).IsRequired();
        f.HasIndex(x => new { x.TenantId, x.UserId, x.RequestId }).IsUnique();
        f.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        f.ToTable("BillingFeedbacks", t => t.HasCheckConstraint("CK_BillingFeedback_Message", "length(trim(\"Message\")) > 0"));
        var d = b.Entity<BillingReminderDismissal>(); d.HasKey(x => new { x.TenantId, x.UserId });
        d.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        var i = b.Entity<BillingInvoice>(); i.HasKey(x => x.Id);
        i.HasIndex(x => new { x.TenantId, x.CycleStart }).IsUnique();
        i.HasIndex(x => x.IdempotencyKey).IsUnique(); i.Property(x => x.IdempotencyKey).HasMaxLength(100);
        i.Property(x => x.State).HasMaxLength(32); i.Property(x => x.ProviderPaymentId).HasMaxLength(200);
        i.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        i.ToTable("BillingInvoices", t => t.HasCheckConstraint("CK_BillingInvoices_AmountPeriod", "\"AmountKrw\" >= 0 AND \"UserCount\" >= 0 AND \"CycleEnd\" > \"CycleStart\""));
        var a = b.Entity<BillingChange>(); a.HasKey(x => x.Id); a.Property(x => x.Action).HasMaxLength(64);
        a.HasIndex(x => new { x.TenantId, x.Id });
        a.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        a.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
    }
}
