using System.ComponentModel.DataAnnotations;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Organization;

public sealed partial class EmployeeService
{
    // Called only after the master self-edit, tenant, and optimistic-version checks.
    private async Task UpdateMasterEmailAsync(TenantMembership member, string? value, CancellationToken token)
    {
        var email = value?.Trim();
        if (string.IsNullOrEmpty(email) || email.Length > 256 || email.Any(char.IsControl) || !new EmailAddressAttribute().IsValid(email))
            throw new OrganizationException(400, "올바른 이메일을 입력해 주세요.");
        if (email == member.User.Email) return;
        var normalized = users.NormalizeEmail(email);
        if (await db.Users.AnyAsync(x => x.Id != member.UserId && x.NormalizedEmail == normalized, token))
            throw new OrganizationException(409, "이미 사용 중인 이메일입니다.");
        member.Version = Guid.NewGuid();
        try
        {
            // Identity clears email verification and rotates the security stamp. UserName and password remain intact.
            var result = await users.SetEmailAsync(member.User, email);
            if (!result.Succeeded)
                throw result.Errors.Any(x => x.Code == "DuplicateEmail")
                    ? new OrganizationException(409, "이미 사용 중인 이메일입니다.")
                    : new OrganizationException(409, "이메일을 저장하지 못했습니다. 사용자 정보를 다시 확인해 주세요.");
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23505", ConstraintName: "EmailIndex" })
        { throw new OrganizationException(409, "이미 사용 중인 이메일입니다."); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
    }
}
