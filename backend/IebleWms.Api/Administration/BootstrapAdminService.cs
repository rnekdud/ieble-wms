using System.ComponentModel.DataAnnotations;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Administration;

public sealed record BootstrapResult(bool Succeeded, string Message);

public sealed class BootstrapAdminService(WmsDbContext db, UserManager<ApplicationUser> users, IHostEnvironment environment, TimeProvider clock)
{
    public async Task<BootstrapResult> CreateAsync(string email, string displayName, string password, CancellationToken token = default)
    {
        if (!environment.IsDevelopment()) return new(false, "개발 환경에서만 실행할 수 있습니다.");
        if (email.Length > 256 || !new EmailAddressAttribute().IsValid(email.Trim()) ||
            string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > 200 || password.Length is < 12 or > 128)
            return new(false, "이메일·이름·비밀번호 형식을 확인해 주세요.");
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        try
        {
            if (await db.AdministratorBootstraps.AnyAsync(token)) return new(false, "최초 관리자 생성이 이미 완료되었습니다.");
            var existing = await db.Users.FirstOrDefaultAsync(x => x.SystemRole == SystemRole.IebleAdministrator, token);
            if (existing is not null)
            {
                db.AdministratorBootstraps.Add(new AdministratorBootstrap { UserId = existing.Id, CreatedAt = clock.GetUtcNow() });
                await db.SaveChangesAsync(token);
                await transaction.CommitAsync(token);
                return new(false, "기존 관리자가 있어 생성하지 않았습니다. 초기화 완료 기록을 보존했습니다.");
            }
            if (await users.FindByEmailAsync(email.Trim()) is not null)
                return new(false, "이미 등록된 이메일입니다. 기존 기업 계정을 승격하지 않습니다.");
            var user = new ApplicationUser { UserName = email.Trim(), Email = email.Trim(), DisplayName = displayName.Trim(), SystemRole = SystemRole.IebleAdministrator };
            var result = await users.CreateAsync(user, password);
            if (!result.Succeeded) return new(false, "관리자를 생성하지 못했습니다. 비밀번호는 12~128자이며 소문자, 숫자, 특수문자를 포함해야 합니다.");
            db.AdministratorBootstraps.Add(new AdministratorBootstrap { UserId = user.Id, CreatedAt = clock.GetUtcNow() });
            // The singleton PK wins concurrent attempts; a losing transaction rolls back its new user too.
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return new(true, "최초 관리자 생성이 완료되었습니다. 공통 로그인 화면에서 로그인하세요.");
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(token);
            return new(false, "초기화 충돌 또는 저장 오류로 생성하지 않았습니다. DB 상태를 확인해 주세요.");
        }
    }
}
