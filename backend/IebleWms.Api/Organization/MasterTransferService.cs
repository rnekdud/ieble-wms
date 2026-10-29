using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Organization;

public sealed class MasterTransferService(WmsDbContext db, SignInManager<ApplicationUser> signIn, OrganizationAudit audit)
{
    public async Task<object> Candidates(Guid tenantId, Guid actor, CancellationToken ct)
    {
        var owner = await db.TenantMemberships.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.UserId == actor, ct);
        var candidates = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && x.UserId != actor && x.IsActive && x.User.IsActive
            && !x.User.MustChangePassword && x.User.SystemRole == SystemRole.None && x.Role != TenantRole.Master)
            .OrderBy(x => x.DisplayName ?? x.User.DisplayName).Select(x => new { x.UserId, name = x.DisplayName ?? x.User.DisplayName, loginId = x.User.UserName, role = x.Role.ToString(), x.Version }).ToListAsync(ct);
        return new { currentMasterVersion = owner.Version, candidates };
    }
    public async Task Transfer(Guid tenantId, Guid actor, TransferMasterRequest request, CancellationToken ct)
    {
        if (request.TargetUserId == actor || string.IsNullOrWhiteSpace(request.Reason)) throw new OrganizationException(400, "위임 대상과 사유를 확인해 주세요.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await OrganizationStructureService.LockAsync(db, tenantId, ct);
        // Recheck after acquiring the lock: an older authorized request may have waited behind a transfer.
        var members = await db.TenantMemberships.Include(x => x.User).Where(x => x.TenantId == tenantId && (x.UserId == actor || x.UserId == request.TargetUserId)).ToListAsync(ct);
        var owner = members.SingleOrDefault(x => x.UserId == actor);
        if (owner is null || owner.Role != TenantRole.Master || !owner.IsActive || !owner.User.IsActive || owner.User.SystemRole != SystemRole.None || owner.User.MustChangePassword)
            throw new OrganizationException(403, "현재 기업 마스터만 위임할 수 있습니다.");
        var target = members.SingleOrDefault(x => x.UserId == request.TargetUserId);
        if (target is null || !target.IsActive || !target.User.IsActive || target.User.MustChangePassword || target.User.SystemRole != SystemRole.None || target.Role == TenantRole.Master)
            throw new OrganizationException(400, "같은 기업의 활성 직원 중 최초 비밀번호 변경을 완료한 직원을 선택해 주세요.");
        if (owner.Version != request.CurrentMasterVersion || target.Version != request.TargetVersion)
            throw new OrganizationException(409, "사용자 정보가 변경되었습니다. 대상을 다시 확인해 주세요.");
        if (await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId && x.IsActive && x.Role == TenantRole.Master, ct) != 1)
            throw new OrganizationException(409, "기업 마스터 수에 이상이 있어 위임을 중단했습니다. 아이블 관리자에게 문의해 주세요.");
        var verified = await signIn.CheckPasswordSignInAsync(owner.User, request.CurrentPassword, lockoutOnFailure: true);
        if (!verified.Succeeded) {
            // Persist Identity failed-attempt/lockout counters, without any role mutation.
            await tx.CommitAsync(ct);
            throw new OrganizationException(400, verified.IsLockedOut ? "인증 시도가 많아 잠겼습니다. 잠시 후 다시 시도해 주세요." : "현재 비밀번호가 일치하지 않습니다.");
        }
        var before = new { formerMaster = new { owner.UserId, role = owner.Role.ToString() }, successor = new { target.UserId, role = target.Role.ToString() } };
        owner.Role = TenantRole.Administrator;
        // Two writes inside ONE transaction avoid transient duplicate keys in the immediate unique index.
        // The deferred DB constraint validates exactly one active master at COMMIT.
        await db.SaveChangesAsync(ct);
        target.Role = TenantRole.Master;
        audit.Add(tenantId, actor, "MasterTransferred", before,
            new { formerMaster = new { owner.UserId, role = owner.Role.ToString() }, successor = new { target.UserId, role = target.Role.ToString() } }, target.UserId, request.Reason.Trim());
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        // Roles are read from DB on every API request; cookies (including persistent cookies) contain no trusted role grant.
    }
}
