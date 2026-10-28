using IebleWms.Api.Models;
using Microsoft.Extensions.Options;

namespace IebleWms.Api.Billing;

public sealed record BillingAccess(string State, bool CanAccessWms, bool HasRegisteredCard,
    DateTimeOffset FreeUntil, DateTimeOffset FirstChargeAt);

public sealed class BillingAccessService(IOptions<BillingPolicyOptions> options, TimeProvider clock)
{
    public BillingPolicyOptions Policy => options.Value;
    private TimeZoneInfo Zone => TimeZoneInfo.FindSystemTimeZoneById(Policy.TimeZoneId);

    public BillingAccess Evaluate(Tenant tenant)
    {
        var entitlement = Evaluate(tenant.CreatedAt, tenant.BillingStatus);
        return !tenant.IsActive || tenant.ServiceStatus != TenantServiceStatus.Active
            ? entitlement with { State = tenant.IsActive ? "Suspended" : "Inactive", CanAccessWms = false }
            : entitlement;
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
