using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Administration;

public sealed record StatusChangeResult(int StatusCode, string Message);

public sealed class TenantAdministrationService(WmsDbContext db, MembershipAccessService access, TimeProvider clock, IebleWms.Api.Billing.BillingAccessService billing)
{
    public async Task<StatusChangeResult> ChangeAsync(Guid actorId, Guid tenantId, string action, Guid version, string reason, CancellationToken token)
    {
        if (!await access.IsIebleAdministratorAsync(actorId, token)) return new(403, "아이블 관리자 권한이 필요합니다.");
        if (version == Guid.Empty || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > 1000) return new(400, "변경 사유와 현재 버전이 필요합니다.");
        var tenant = await db.Tenants.SingleOrDefaultAsync(x => x.Id == tenantId, token);
        if (tenant is null) return new(404, "기업을 찾을 수 없습니다.");
        if (!tenant.IsActive) return new(409, "비활성화된 기업은 이 화면에서 변경할 수 없습니다.");
        if (tenant.Version != version) return new(409, "다른 관리자가 변경했습니다. 목록을 새로고침해 주세요.");
        TenantServiceStatus? next = (tenant.ServiceStatus, action) switch
        {
            (TenantServiceStatus.Active, "suspend") => TenantServiceStatus.Suspended,
            (TenantServiceStatus.Suspended, "reactivate") => TenantServiceStatus.Active,
            _ => null
        };
        if (next == TenantServiceStatus.Active && !billing.EvaluateEntitlement(tenant).CanAccessWms) return new(409, "카드 등록과 무료 이용 기간 또는 결제 완료가 확인되어야 재활성화할 수 있습니다.");
        if (next is null) return new(409, "현재 기업 상태에서는 요청한 변경을 할 수 없습니다.");
        db.TenantStatusChanges.Add(new TenantStatusChange { TenantId = tenant.Id, FromStatus = tenant.ServiceStatus, ToStatus = next.Value, ChangedByUserId = actorId, ChangedAt = clock.GetUtcNow(), Reason = reason.Trim() });
        tenant.ServiceStatus = next.Value;
        try
        {
            // One SaveChanges transaction persists both the optimistic update and the immutable history.
            await db.SaveChangesAsync(token);
            return new(200, "기업 상태가 변경되었습니다.");
        }
        catch (DbUpdateConcurrencyException) { return new(409, "다른 관리자가 변경했습니다. 목록을 새로고침해 주세요."); }
    }
}
