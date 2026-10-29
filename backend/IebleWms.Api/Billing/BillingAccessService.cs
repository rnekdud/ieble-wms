using IebleWms.Api.Models;
using Microsoft.Extensions.Options;

namespace IebleWms.Api.Billing;

public sealed record BillingAccess(string State, bool CanAccessWms, bool HasRegisteredCard,
    DateTimeOffset FreeUntil, DateTimeOffset FirstChargeAt);

public sealed class BillingAccessService(IOptions<BillingPolicyOptions> options, TimeProvider clock)
{
    public BillingPolicyOptions Policy => options.Value;
    private TimeZoneInfo Zone => TimeZoneInfo.FindSystemTimeZoneById(Policy.TimeZoneId);

    public void InitializeNewContract(Tenant tenant)
    {
        var now = clock.GetUtcNow();
        var local = TimeZoneInfo.ConvertTime(now, Zone).DateTime;
        tenant.BillingPolicyVersion = 2;
        tenant.BillingTimeZone = Policy.TimeZoneId;
        tenant.TrialStartedAt = now;
        tenant.TrialEndsAt = ToUtc(local.AddMonths(Policy.TrialMonths));
        tenant.BillingAnchorDay = Policy.RecurringAnchorDay == 0 ? local.Day : Policy.RecurringAnchorDay;
        tenant.FirstChargeAt = tenant.TrialEndsAt;
        if (Policy.RecurringAnchorDay != 0)
            tenant.FirstChargeAt = CycleAtOrAfter(tenant, tenant.TrialEndsAt.Value);
    }

    public BillingAccess Evaluate(Tenant tenant)
    {
        var entitlement = EvaluateEntitlement(tenant);
        return !tenant.IsActive || tenant.ServiceStatus != TenantServiceStatus.Active
            ? entitlement with { State = tenant.IsActive ? "Suspended" : "Inactive", CanAccessWms = false }
            : entitlement;
    }
    // Used by the support reactivation workflow; suspension is handled separately there.
    public BillingAccess EvaluateEntitlement(Tenant t)
    {
        var legacy = Evaluate(t.CreatedAt, t.BillingStatus);
        var now = clock.GetUtcNow();
        var end = t.TrialEndsAt ?? legacy.FreeUntil;
        var first = t.FirstChargeAt ?? legacy.FirstChargeAt;
        var card = legacy.HasRegisteredCard;
        if (t.CreatedAt == default || t.CreatedAt > now) return new("RegistrationInvalid", false, card, end, first);
        if (t.AutoBillingCanceledAt.HasValue)
            return new(t.ServiceEndsAt > now ? "CancellationScheduled" : "SubscriptionEnded", t.ServiceEndsAt > now, card, end, first);
        if (t.BillingPolicyVersion == 1) {
            if (t.BillingStatus == TenantBillingStatus.Paid && t.PaidThrough is DateTimeOffset paidEnd)
                return new(now < paidEnd ? "Paid" : "PaymentRequired", now < paidEnd, card, end, first);
            if (t.TrialEndsAt is null) return legacy;
            return new(!card ? "CardRequired" : t.BillingStatus == TenantBillingStatus.Paid ? "Paid" : now < end ? "RegistrationMonthFree" : "PaymentRequired",
                card && (t.BillingStatus == TenantBillingStatus.Paid || now < end), card, end, first);
        }
        if (t.TrialStartedAt is null || t.TrialEndsAt is null || t.FirstChargeAt is null || t.BillingAnchorDay is null)
            return new("RegistrationInvalid", false, card, end, first);
        // [start, end): exactly at the end, verified paid entitlement is required.
        if (now >= t.TrialStartedAt && now < end) return new("Trial", true, card, end, first);
        if (t.BillingStatus == TenantBillingStatus.Paid && t.PaidThrough > now) return new("Paid", true, card, end, first);
        return new(card ? "PaymentRequired" : "CardRequired", false, card, end, first);
    }
    public DateOnly LocalDate(Tenant t, DateTimeOffset instant) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZoneInfo.FindSystemTimeZoneById(t.BillingTimeZone)).DateTime);
    public DateTimeOffset CycleAtOrAfter(Tenant t, DateTimeOffset instant)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(t.BillingTimeZone);
        var local = TimeZoneInfo.ConvertTime(instant, zone).DateTime;
        var first = TimeZoneInfo.ConvertTime(t.FirstChargeAt ?? t.TrialEndsAt ?? Evaluate(t).FirstChargeAt, zone).DateTime;
        var anchor = t.BillingAnchorDay ?? Policy.BillingDayOfMonth;
        var candidate = new DateTime(local.Year, local.Month, Math.Min(anchor, DateTime.DaysInMonth(local.Year, local.Month))).Add(first.TimeOfDay);
        if (candidate < local) {
            var next = new DateTime(local.Year, local.Month, 1).AddMonths(1);
            candidate = new DateTime(next.Year, next.Month, Math.Min(anchor, DateTime.DaysInMonth(next.Year, next.Month))).Add(first.TimeOfDay);
        }
        var result = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(candidate, DateTimeKind.Unspecified), zone));
        return t.FirstChargeAt is DateTimeOffset minimum && result < minimum ? minimum : result;
    }
    public DateTimeOffset NextCycle(Tenant t, DateTimeOffset cycle) => CycleAtOrAfter(t, cycle.AddTicks(1));
    public DateTimeOffset FirstMemberChargeAt(Tenant t, TenantMembership m)
    {
        if (t.BillingPolicyVersion == 1 && t.BillingAnchorDay is null) return FirstMemberChargeAt(m);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(t.BillingTimeZone);
        var local = TimeZoneInfo.ConvertTime(m.CreatedAt, zone);
        var eligible = Policy.NewMembersStartFollowingMonth
            ? new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(new DateTime(local.Year, local.Month, 1).AddMonths(1), zone)) : m.CreatedAt;
        return CycleAtOrAfter(t, eligible);
    }

    // PaymentRequired means that a trusted server-side card registration was completed.
    // No public API writes this state, and the current unintegrated provider never creates it.
    public BillingAccess Evaluate(DateTimeOffset registeredAt, TenantBillingStatus status)
    {
        var now = clock.GetUtcNow();
        var local = TimeZoneInfo.ConvertTime(registeredAt, Zone);
        var nextMonth = new DateTime(local.Year, local.Month, 1).AddMonths(1);
        var freeUntil = ToUtc(nextMonth);
        var firstChargeAt = Policy.RegistrationMonthFree
            ? ToUtc(nextMonth.AddDays(Policy.BillingDayOfMonth - 1)) : registeredAt;
        var card = status is TenantBillingStatus.PaymentRequired or TenantBillingStatus.Paid;
        if (registeredAt == default || registeredAt > now)
            return new("RegistrationInvalid", false, card, freeUntil, firstChargeAt);
        if (!card) return new("CardRequired", false, false, freeUntil, firstChargeAt);
        if (status == TenantBillingStatus.Paid) return new("Paid", true, true, freeUntil, firstChargeAt);
        if (Policy.RegistrationMonthFree && now < freeUntil)
            return new("RegistrationMonthFree", true, true, freeUntil, firstChargeAt);
        return new("PaymentRequired", false, true, freeUntil, firstChargeAt);
    }

    // Planning dates only: no invoice, charge, amount total or external payment is created.
    public DateTimeOffset FirstMemberChargeAt(TenantMembership membership)
    {
        if (!Policy.NewMembersStartFollowingMonth) return membership.CreatedAt;
        var local = TimeZoneInfo.ConvertTime(membership.CreatedAt, Zone);
        return ToUtc(new DateTime(local.Year, local.Month, 1).AddMonths(1).AddDays(Policy.BillingDayOfMonth - 1));
    }
    public bool IsBillableRole(TenantRole role) => role != TenantRole.Master || Policy.BillMasterAccounts;
    private DateTimeOffset ToUtc(DateTime local) => new(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), Zone));
}
