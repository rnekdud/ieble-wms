using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Services;

public sealed record RegistrationResult(bool Succeeded, bool Conflict, string? Message, string? Code = null);

public sealed class CompanyRegistrationService(WmsDbContext db, UserManager<ApplicationUser> users, IebleWms.Api.Billing.BillingAccessService billing, TimeProvider clock)
{
    public const string DuplicateCompanyMessage = "이미 등록된 기업입니다. 기존 기업 계정으로 로그인하거나, 계정 등록이 필요한 경우 기업 관리자에게 문의해 주세요.";
    public async Task<RegistrationResult> RegisterAsync(RegisterCompanyRequest request, CancellationToken token)
    {
        var email = request.Email.Trim();
        var businessNumber = BusinessRegistrationNumber.Normalize(request.BusinessRegistrationNumber);
        if (!BusinessRegistrationNumber.IsValid(businessNumber) || string.IsNullOrWhiteSpace(request.CompanyName))
            return new(false, false, "기업명과 사업자등록번호를 확인해 주세요.");
        if (await db.Tenants.AnyAsync(x => x.BusinessRegistrationNumber == businessNumber, token))
            return new(false, true, DuplicateCompanyMessage, "duplicate_company");
        if (await db.Users.AnyAsync(x => x.NormalizedEmail == users.NormalizeEmail(email), token))
            return new(false, true, "이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.", "duplicate_email");

        await using var transaction = await db.Database.BeginTransactionAsync(token);
        try
        {
            var user = new ApplicationUser
            {
                UserName = email, Email = email, DisplayName = request.ContactName.Trim(),
                PhoneNumber = request.ContactPhone.Trim(), SystemRole = SystemRole.None,
                MustChangePassword = false // Masters keep their chosen signup password; staff initialization is separate.
            };
            var created = await users.CreateAsync(user, request.Password);
            if (!created.Succeeded && created.Errors.Any(x => x.Code is "DuplicateEmail" or "DuplicateUserName"))
                return await db.Tenants.AnyAsync(x => x.BusinessRegistrationNumber == businessNumber, token)
                    ? new(false, true, DuplicateCompanyMessage, "duplicate_company")
                    : new(false, true, "이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.", "duplicate_email");
            if (!created.Succeeded)
                return new(false, false, "가입 정보를 확인해 주세요. 비밀번호는 8~128자이며 영문 소문자, 숫자, 특수문자를 포함해야 합니다.");
            var tenant = new Tenant
            {
                Name = request.CompanyName.Trim(), Code = "T" + Guid.NewGuid().ToString("N").ToUpperInvariant(),
                BusinessRegistrationNumber = businessNumber,
                ContactName = request.ContactName.Trim(), ContactPhone = request.ContactPhone.Trim(),
                ServiceStatus = TenantServiceStatus.Active,
                BillingStatus = TenantBillingStatus.CardRequired
            };
            db.TenantMemberships.Add(new TenantMembership { User = user, Tenant = tenant, Role = TenantRole.Master, IsDefault = true, DisplayName = request.ContactName.Trim(),
                BillingStartsAt = billing.FirstMemberChargeAt(new TenantMembership { CreatedAt = clock.GetUtcNow() }) });
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return new(true, false, null);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // The unique indexes also protect against concurrent signups; never expose SQL/parameter details.
            await transaction.RollbackAsync(token);
            await transaction.DisposeAsync();
            var companyExists = ex.InnerException is PostgresException { ConstraintName: "IX_Tenants_BusinessRegistrationNumber" }
                || await db.Tenants.AnyAsync(x => x.BusinessRegistrationNumber == businessNumber, token);
            return companyExists
                ? new(false, true, DuplicateCompanyMessage, "duplicate_company")
                : new(false, true, "이미 등록된 이메일입니다. 기존 계정으로 로그인해 주세요.", "duplicate_email");
        }
    }
}
