using System.Text.Json;
using IebleWms.Api.Billing;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Organization;

public sealed record EmployeeCredentialResult(EmployeeView User);

public sealed class EmployeeService(WmsDbContext db, UserManager<ApplicationUser> users, BillingAccessService billing, OrganizationAudit audit, TimeProvider clock, OrganizationStructureService structure)
{
    // Scoped exception for initial credentials only. Never change shared Identity password options
    // or validators: personal passwords and public company signup keep the normal policy.
    private async Task<IdentityResult> SetInitialPasswordAsync(ApplicationUser user)
    {
        if (string.IsNullOrWhiteSpace(user.UserName)) throw new InvalidOperationException("직원 로그인 아이디가 필요합니다.");
        user.MustChangePassword = true;
        user.PasswordHash = users.PasswordHasher.HashPassword(user, user.UserName);
        return await users.UpdateSecurityStampAsync(user);
    }
    private static object Snapshot(TenantMembership m) => new { m.UserId, m.DisplayName, role = m.Role.ToString(), m.IsActive, m.DeactivatedAt, m.DepartmentId, m.PositionId };

    public async Task<EmployeeCredentialResult> CreateAsync(Guid tenantId, Guid actor, CreateEmployeeRequest request, CancellationToken token)
    {
        var name = request.Name.Trim(); var loginId = request.LoginId.Trim(); var email = request.Email.Trim();
        if (name.Length == 0 || email.Any(char.IsControl) || request.Role is not ("Administrator" or "Employee"))
            throw new OrganizationException(400, "이름, 이메일, 권한을 확인해 주세요.");
        var normalizedName = users.NormalizeName(loginId); var normalizedEmail = users.NormalizeEmail(email);
        if (await db.Users.AnyAsync(x => x.NormalizedUserName == normalizedName || x.NormalizedEmail == normalizedEmail, token)) throw Duplicate();
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        await OrganizationStructureService.LockAsync(db, tenantId, token);
        var actorRole = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && x.UserId == actor && x.IsActive && x.User.IsActive).Select(x => (TenantRole?)x.Role).SingleOrDefaultAsync(token);
        if (actorRole is not (TenantRole.Master or TenantRole.Administrator) || (request.Role == "Administrator" && actorRole != TenantRole.Master))
            throw new OrganizationException(403, "기업 관리자 지정은 기업 마스터만 할 수 있습니다.");
        await structure.ValidateAssignmentAsync(tenantId, request.DepartmentId, request.PositionId, null, null, token);
        try
        {
            var user = new ApplicationUser { UserName = loginId, Email = email, DisplayName = name, MustChangePassword = true };
            var created = await users.CreateAsync(user);
            if (!created.Succeeded) throw created.Errors.Any(x => x.Code is "DuplicateEmail" or "DuplicateUserName") ? Duplicate() : new OrganizationException(400, "직원 정보를 확인해 주세요.");
            var assigned = await SetInitialPasswordAsync(user);
            if (!assigned.Succeeded) throw new OrganizationException(409, "직원 생성이 충돌했습니다. 목록을 다시 확인해 주세요.");
            var tenant = await db.Tenants.SingleAsync(x => x.Id == tenantId, token);
            var membership = new TenantMembership { TenantId = tenantId, User = user, DisplayName = name,
                Role = Enum.Parse<TenantRole>(request.Role), IsDefault = true, DepartmentId = request.DepartmentId, PositionId = request.PositionId,
                BillingStartsAt = billing.FirstMemberChargeAt(tenant, new TenantMembership { CreatedAt = clock.GetUtcNow() }) };
            db.TenantMemberships.Add(membership);
            audit.Add(tenantId, actor, "EmployeeCreated", new { }, new { user.Id, request.Role, membership.BillingStartsAt, membership.DepartmentId, membership.PositionId }, user.Id);
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return new(EmployeeView.From(membership, billing));
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23505" }) { throw Duplicate(); }
    }

    public async Task<EmployeeView> UpdateAsync(Guid tenantId, Guid actor, Guid userId, UpdateEmployeeRequest request, CancellationToken token)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        await OrganizationStructureService.LockAsync(db, tenantId, token);
        var membership = await FindAsync(tenantId, userId, token);
        await structure.ValidateAssignmentAsync(tenantId, request.DepartmentId, request.PositionId, membership.DepartmentId, membership.PositionId, token);
        Protect(membership, actor, request.Role, request.IsActive);
        if (membership.Role.ToString() != request.Role && !await db.TenantMemberships.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.UserId == actor && x.IsActive && x.User.IsActive && x.Role == TenantRole.Master, token))
            throw new OrganizationException(403, "시스템 권한 변경은 기업 마스터만 할 수 있습니다.");
        if (membership.Version != request.Version) throw Stale();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Role is not ("Administrator" or "Employee")) throw new OrganizationException(400, "이름과 권한을 확인해 주세요.");
        var before = Snapshot(membership);
        membership.DepartmentId = request.DepartmentId; membership.PositionId = request.PositionId;
        membership.DisplayName = request.Name.Trim(); membership.Role = Enum.Parse<TenantRole>(request.Role);
        if (membership.IsActive != request.IsActive) membership.DeactivatedAt = request.IsActive ? null : clock.GetUtcNow();
        membership.IsActive = request.IsActive;
        // Do not change global account state, original registration date or billing termination dates.
        if (JsonSerializer.Serialize(before) == JsonSerializer.Serialize(Snapshot(membership))) return EmployeeView.From(membership, billing);
        audit.Add(tenantId, actor, "EmployeeUpdated", before, Snapshot(membership), userId);
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        await transaction.CommitAsync(token);
        return EmployeeView.From(membership, billing);
    }

    public async Task<EmployeeView> AssignMasterOrganizationAsync(Guid tenantId, Guid actor, Guid userId, MemberOrganizationRequest request, CancellationToken token)
    {
        await using var tx = await db.Database.BeginTransactionAsync(token); await OrganizationStructureService.LockAsync(db, tenantId, token);
        var member = await FindAsync(tenantId, userId, token);
        if (actor != userId || member.Role != TenantRole.Master) throw new OrganizationException(403, "마스터 본인의 부서·직급만 설정할 수 있습니다.");
        if (member.Version != request.Version) throw Stale();
        await structure.ValidateAssignmentAsync(tenantId, request.DepartmentId, request.PositionId, member.DepartmentId, member.PositionId, token);
        var before = Snapshot(member); member.DepartmentId = request.DepartmentId; member.PositionId = request.PositionId;
        if (JsonSerializer.Serialize(before) != JsonSerializer.Serialize(Snapshot(member)))
        {
            audit.Add(tenantId, actor, "MemberOrganizationUpdated", before, Snapshot(member), userId);
            try { await db.SaveChangesAsync(token); } catch (DbUpdateConcurrencyException) { throw Stale(); }
        }
        await tx.CommitAsync(token); return EmployeeView.From(member, billing);
    }

    public async Task<EmployeeCredentialResult> ResetPasswordAsync(Guid tenantId, Guid actor, Guid userId, Guid version, CancellationToken token)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        await OrganizationStructureService.LockAsync(db, tenantId, token);
        var membership = await FindAsync(tenantId, userId, token);
        if (membership.Role == TenantRole.Master || membership.User.SystemRole != SystemRole.None || userId == actor) throw new OrganizationException(403, "마스터 또는 본인의 비밀번호는 이 화면에서 초기화할 수 없습니다.");
        if (membership.Version != version) throw Stale();
        if (!membership.IsActive || !membership.User.IsActive) throw new OrganizationException(409, "활성 상태인 직원만 비밀번호를 초기화할 수 있습니다.");
        if (await db.TenantMemberships.AnyAsync(x => x.UserId == userId && x.TenantId != tenantId, token))
            throw new OrganizationException(409, "여러 기업에 소속된 계정은 기업 관리자가 비밀번호를 초기화할 수 없습니다.");
        membership.Version = Guid.NewGuid(); // Include membership state in the optimistic concurrency check.
        membership.User.MustChangePassword = true;
        IdentityResult reset;
        try { reset = await SetInitialPasswordAsync(membership.User); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        if (!reset.Succeeded) throw Stale();
        // Identity rotates the SecurityStamp: all existing sessions are invalid immediately.
        audit.Add(tenantId, actor, "EmployeePasswordReset", new { }, new { MustChangePassword = true }, userId);
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        await transaction.CommitAsync(token);
        return new(EmployeeView.From(membership, billing));
    }

    private async Task<TenantMembership> FindAsync(Guid tenantId, Guid userId, CancellationToken token) =>
        await db.TenantMemberships.Include(x => x.User).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, token)
            ?? throw new OrganizationException(404, "사용자를 찾을 수 없습니다.");
    private static void Protect(TenantMembership membership, Guid actor, string role, bool active)
    {
        if (membership.Role == TenantRole.Master || membership.User.SystemRole != SystemRole.None) throw new OrganizationException(403, "기업 마스터 계정은 사용자 관리에서 변경할 수 없습니다.");
        if (membership.UserId == actor && (role != membership.Role.ToString() || !active)) throw new OrganizationException(403, "본인의 권한과 활성 상태는 변경할 수 없습니다.");
    }
    private static OrganizationException Stale() => new(409, "사용자 정보가 변경되었습니다. 목록을 새로 불러와 주세요.");
    private static OrganizationException Duplicate() => new(409, "이미 등록된 로그인 아이디 또는 이메일입니다. 기존 계정을 중복 생성하거나 다른 기업에 자동 연결하지 않습니다.");
}
