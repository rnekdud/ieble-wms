using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Data;
internal static class PartnerModel
{
    public static void Configure(ModelBuilder b)
    {
        var p = b.Entity<Partner>();
        p.HasKey(x => x.Id);
        p.HasAlternateKey(x => new { x.TenantId, x.Id });
        p.Property(x => x.Code).HasMaxLength(64).IsRequired();
        p.Property(x => x.NormalizedCode).HasMaxLength(64).IsRequired();
        p.Property(x => x.Name).HasMaxLength(200).IsRequired();
        p.Property(x => x.Type).HasMaxLength(16).IsRequired();
        p.Property(x => x.RegistrationCountry).HasMaxLength(8).IsRequired();
        p.Property(x => x.NormalizedBusinessNumber).HasMaxLength(64);
        p.Property(x => x.CreationHash).HasMaxLength(64).IsRequired();
        p.Property(x => x.Version).IsConcurrencyToken();
        p.Property(x => x.BusinessRegistrationNumber).HasMaxLength(64);
        p.Property(x => x.RepresentativeName).HasMaxLength(100);
        p.Property(x => x.PostalCode).HasMaxLength(20);
        p.Property(x => x.Address).HasMaxLength(500);
        p.Property(x => x.AddressDetail).HasMaxLength(500);
        p.Property(x => x.Phone).HasMaxLength(50);
        p.Property(x => x.Email).HasMaxLength(254);
        p.Property(x => x.ContactName).HasMaxLength(100);
        p.Property(x => x.ContactPhone).HasMaxLength(50);
        p.Property(x => x.PaymentTerms).HasMaxLength(500);
        p.Property(x => x.Notes).HasMaxLength(2000);
        p.HasIndex(x => new { x.TenantId, x.NormalizedCode }).IsUnique();
        p.HasIndex(x => new { x.TenantId, x.CreationRequestId }).IsUnique();
        // Branches and separate trading relationships can legitimately share a number.
        p.HasIndex(x => new { x.TenantId, x.RegistrationCountry, x.NormalizedBusinessNumber });
        p.HasIndex(x => new { x.TenantId, x.IsActive, x.Type });
        p.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        p.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        p.ToTable("Partners", t => {
            t.HasCheckConstraint("CK_Partners_Code", "length(trim(\"Code\")) > 0 AND length(trim(\"NormalizedCode\")) > 0");
            t.HasCheckConstraint("CK_Partners_Name", "length(trim(\"Name\")) > 0");
            t.HasCheckConstraint("CK_Partners_Type", "\"Type\" IN ('SUPPLIER','CUSTOMER','BOTH')");
            t.HasCheckConstraint("CK_Partners_Country", "\"RegistrationCountry\" IN ('KR','OTHER')");
            t.HasCheckConstraint("CK_Partners_BusinessNumber", "\"NormalizedBusinessNumber\" IS NULL OR \"RegistrationCountry\" <> 'KR' OR (length(\"NormalizedBusinessNumber\") = 10 AND replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(\"NormalizedBusinessNumber\", '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = '')");
        });
        var h = b.Entity<PartnerChange>();
        h.HasKey(x => x.Id);
        h.Property(x => x.Action).HasMaxLength(64).IsRequired();
        h.HasIndex(x => new { x.TenantId, x.TargetId, x.Id });
        h.HasOne<Partner>().WithMany().HasForeignKey(x => new { x.TenantId, x.TargetId }).HasPrincipalKey(x => new { x.TenantId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        h.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.ChangedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
