using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace IebleWms.Api.Billing;

public sealed class SubscriptionService(WmsDbContext db, BillingAccessService billing, TimeProvider clock)
{
    private async Task<IDbContextTransaction> Lock(Guid tenantId, CancellationToken ct)
    {
        var tx = await db.Database.BeginTransactionAsync(ct);
        try {
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"billing:" + tenantId}, 0))", ct);
            return tx;
        } catch { await tx.DisposeAsync(); throw; }
    }
    private Task<Tenant> Tenant(Guid id, CancellationToken ct) => db.Tenants.SingleAsync(x => x.Id == id, ct);
    private void Audit(Guid tenantId, Guid? actor, string action, object before, object after) => db.BillingChanges.Add(new BillingChange {
        TenantId = tenantId, ActorId = actor, Action = action, ChangedAt = clock.GetUtcNow(), BeforeJson = JsonSerializer.Serialize(before), AfterJson = JsonSerializer.Serialize(after)
    });
    public async Task<object> Read(Guid tenantId, Guid actor, CancellationToken ct)
    {
        var t = await Tenant(tenantId, ct); var access = billing.Evaluate(t); var now = clock.GetUtcNow();
        var today = billing.LocalDate(t, now); var firstDay = billing.LocalDate(t, access.FirstChargeAt);
        var days = firstDay.DayNumber - today.DayNumber;
        var dismissed = await db.BillingReminderDismissals.AnyAsync(x => x.TenantId == tenantId && x.UserId == actor && x.LocalDate == today, ct);
        var currentUsers = await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId && x.IsActive && x.User.IsActive && (billing.Policy.BillMasterAccounts || x.Role != TenantRole.Master), ct);
        var billable = await BillableCount(t, access.FirstChargeAt, ct);
        return new { t.BillingPolicyVersion, t.TrialStartedAt, trialEndsAt = access.FreeUntil, firstChargeAt = access.FirstChargeAt,
            billingAnchorDay = t.BillingAnchorDay ?? billing.Policy.BillingDayOfMonth, t.BillingTimeZone, t.PaidThrough,
            autoBillingCanceled = t.AutoBillingCanceledAt.HasValue, t.AutoBillingCanceledAt, t.ServiceEndsAt,
            daysUntilFirstCharge = Math.Max(0, days), currentUsers, estimatedMonthlyKrw = Amount(currentUsers), firstChargeUsers = billable, firstChargeEstimateKrw = Amount(billable),
            reminderVisible = t.IsActive && t.ServiceStatus == TenantServiceStatus.Active && !access.HasRegisteredCard && !t.AutoBillingCanceledAt.HasValue && days <= billing.Policy.ReminderDays && !dismissed,
            providerConfigured = false, access,
            invoices = await db.BillingInvoices.AsNoTracking().Where(x => x.TenantId == tenantId).OrderByDescending(x => x.CycleStart).Take(24).Select(x => new { x.Id, x.CycleStart, x.CycleEnd, x.UserCount, x.AmountKrw, x.State }).ToListAsync(ct) };
    }
    private long Amount(int count) => (long)billing.Policy.MonthlyBaseKrw + (long)Math.Max(0, count - billing.Policy.IncludedUsers) * billing.Policy.MonthlyPerUserKrw;
    private Task<int> BillableCount(Tenant t, DateTimeOffset cycle, CancellationToken ct) => db.TenantMemberships.CountAsync(x => x.TenantId == t.Id
        && (billing.Policy.BillMasterAccounts || x.Role != TenantRole.Master)
        && x.BillingStartsAt != null && x.BillingStartsAt <= cycle && (x.BillingEndsAt == null || x.BillingEndsAt > cycle), ct);
    public async Task Dismiss(Guid tenantId, Guid actor, CancellationToken ct)
    {
        await using var tx = await Lock(tenantId, ct); var t = await Tenant(tenantId, ct);
        var row = await db.BillingReminderDismissals.FindAsync([tenantId, actor], ct);
        if (row == null) { row = new() { TenantId = tenantId, UserId = actor }; db.BillingReminderDismissals.Add(row); }
        row.LocalDate = billing.LocalDate(t, clock.GetUtcNow()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task SaveFeedback(Guid tenantId, Guid actor, Guid requestId, string? message, CancellationToken ct)
    {
        var trimmed = message?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return; // Never create empty feedback.
        if (requestId == Guid.Empty || trimmed.Length > 2000) throw new OrganizationException(400, "소감은 2,000자 이내로 입력해 주세요.");
        await using var tx = await Lock(tenantId, ct);
        var prior = await db.BillingFeedbacks.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == actor && x.RequestId == requestId, ct);
        if (prior != null) { if (prior.Message != trimmed) throw new OrganizationException(409, "이미 저장된 요청입니다. 화면을 다시 열어 주세요."); }
        else db.BillingFeedbacks.Add(new() { TenantId = tenantId, UserId = actor, RequestId = requestId, Message = trimmed, CreatedAt = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task Cancel(Guid tenantId, Guid actor, CancellationToken ct)
    {
        await using var tx = await Lock(tenantId, ct); var t = await Tenant(tenantId, ct);
        if (t.AutoBillingCanceledAt.HasValue) { await tx.CommitAsync(ct); return; }
        // Legacy paid records have no verified paid-through date. Never invent or truncate that entitlement.
        if (t.BillingStatus == TenantBillingStatus.Paid && t.PaidThrough is null)
            throw new OrganizationException(409, "기존 결제의 이용 종료일 확인이 필요합니다. 고객센터에 문의해 주세요. 기존 이용 권한은 유지됩니다.");
        var freeUntil = billing.EvaluateEntitlement(t).FreeUntil;
        var end = t.PaidThrough > freeUntil ? t.PaidThrough.Value : freeUntil;
        t.AutoBillingCanceledAt = clock.GetUtcNow(); t.ServiceEndsAt = end;
        Audit(tenantId, actor, "AutoBillingCanceled", new { autoBillingCanceled = false }, new { t.AutoBillingCanceledAt, t.ServiceEndsAt, refund = false });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    // Integration seam only: no scheduler invokes this and no external payment is attempted.
    // A future provider worker must share this lock with cancellation and verify provider responses.
    public async Task<BillingInvoice> PrepareNextInvoice(Guid tenantId, CancellationToken ct)
    {
        await using var tx = await Lock(tenantId, ct); var t = await Tenant(tenantId, ct);
        if (t.AutoBillingCanceledAt.HasValue || !t.IsActive || t.ServiceStatus != TenantServiceStatus.Active)
            throw new OrganizationException(409, "자동결제가 중지된 기업입니다.");
        var cycle = t.PaidThrough ?? billing.EvaluateEntitlement(t).FirstChargeAt;
        if (cycle > clock.GetUtcNow()) throw new OrganizationException(409, "아직 청구 예정일이 아닙니다.");
        var invoice = await db.BillingInvoices.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CycleStart == cycle, ct);
        if (invoice == null) {
            if (await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.BillingStartsAt == null, ct))
                throw new OrganizationException(409, "기존 사용자 과금 시작일 확인이 필요합니다. 자동 청구를 보류합니다.");
            if (await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && (!x.IsActive || !x.User.IsActive) && x.BillingEndsAt == null, ct))
                throw new OrganizationException(409, "비활성 직원 과금 종료 정책 확인이 필요합니다. 자동 청구를 보류합니다.");
            var users = await BillableCount(t, cycle, ct);
            invoice = new() { TenantId = tenantId, CycleStart = cycle, CycleEnd = billing.NextCycle(t, cycle), UserCount = users, AmountKrw = Amount(users),
                IdempotencyKey = $"{tenantId:N}:{cycle.UtcTicks}", CreatedAt = clock.GetUtcNow() };
            db.BillingInvoices.Add(invoice);
            Audit(tenantId, null, "InvoicePrepared", new { }, new { invoice.Id, invoice.CycleStart, invoice.CycleEnd, invoice.UserCount, invoice.AmountKrw, invoice.State });
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct); return invoice;
    }
}
