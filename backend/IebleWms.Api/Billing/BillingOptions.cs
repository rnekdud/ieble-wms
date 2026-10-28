using System.ComponentModel.DataAnnotations;

namespace IebleWms.Api.Billing;

// Configuration only: no HTTP client, scheduler, payment endpoint or entitlement override.
public sealed class TossPaymentsOptions
{
    public const string SectionName = "Billing:TossPayments";
    public string ClientKey { get; set; } = "";
    public string SecretKey { get; set; } = "";
}

public sealed class BillingPolicyOptions
{
    public const string SectionName = "Billing:Policy";
    [Range(0, 100000000)] public int MonthlyPerUserKrw { get; set; } = 1000;
    [Range(0, 100000000)] public int MonthlyBaseKrw { get; set; } = 0;
    [Range(0, 1000000)] public int IncludedUsers { get; set; } = 0;
    public bool BillMasterAccounts { get; set; } = true;
    public bool RegistrationMonthFree { get; set; } = true;
    public bool NewMembersStartFollowingMonth { get; set; } = true;
    // Restrict configurable days to those present in every calendar month.
    [Range(1, 28)] public int BillingDayOfMonth { get; set; } = 1;
    [Required] public string TimeZoneId { get; set; } = "Asia/Seoul";
}
