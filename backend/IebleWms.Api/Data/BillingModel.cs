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
        f.Property(x => x.Message).HasMaxLength(10000).IsRequired();
        f.HasIndex(x => new { x.TenantId, x.UserId, x.RequestId }).IsUnique();
        f.HasOne<TenantMembership>().WithMany().HasForeignKey(x => new { x.TenantId, x.UserId }).OnDelete(DeleteBehavior.Restrict);
        f.ToTable("BillingFeedbacks", t => t.HasCheckConstraint("CK_BillingFeedback_Message", "length(trim(\"Message\")) > 0"));
        f.Property(x => x.Number).HasMaxLength(40);
        f.Property(x => x.Title).HasMaxLength(200);
        f.Property(x => x.Category).HasMaxLength(24);
        f.Property(x => x.Status).HasMaxLength(24);
        f.Property(x => x.Answer).HasMaxLength(10000);
        f.Property(x => x.RequestHash).HasMaxLength(64);
        f.Property(x => x.Version).IsConcurrencyToken();
        f.HasAlternateKey(x => new { x.TenantId, x.Id });
        f.HasIndex(x => new { x.TenantId, x.Number }).IsUnique().HasFilter("\"Number\" <> ''");
        f.HasIndex(x => new { x.TenantId, x.CreatedAt });
        f.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.AssignedToId).OnDelete(DeleteBehavior.Restrict);
        f.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.AnsweredById).OnDelete(DeleteBehavior.Restrict);
        f.ToTable("BillingFeedbacks", t => t.HasCheckConstraint("CK_Support_Status", "\"Status\" IN ('Received','InProgress','Answered','Closed')"));
        var aFile = b.Entity<SupportAttachment>(); aFile.HasKey(x => x.Id);
        aFile.Property(x => x.FileName).HasMaxLength(160); aFile.Property(x => x.ContentType).HasMaxLength(120);
        aFile.HasOne<BillingFeedback>().WithMany().HasForeignKey(x => new { x.TenantId, x.FeedbackId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        var change = b.Entity<SupportChange>(); change.HasKey(x => x.Id);
        change.HasOne<BillingFeedback>().WithMany().HasForeignKey(x => new { x.TenantId, x.FeedbackId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        change.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ActorId).OnDelete(DeleteBehavior.Restrict);
        change.HasIndex(x => new { x.TenantId, x.FeedbackId, x.Id });
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
