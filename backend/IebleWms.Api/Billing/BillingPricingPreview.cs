using System.Globalization;
using System.Text.Json;
namespace IebleWms.Api.Billing;

// Display estimates only. Never used by invoice preparation or access decisions.
public sealed record BillingPreviewPolicy(int MonthlyPerUserKrw, int AnnualDiscountPercent,
    bool EventEnabled, int EventMonthlyPerUserKrw, string? EventEndsOn);
public static class BillingPricingPreview
{
    private static readonly Lazy<BillingPreviewPolicy> Settings = new(() => {
        using var stream = typeof(BillingPricingPreview).Assembly.GetManifestResourceStream("BillingPreviewPolicy.json")
            ?? throw new InvalidOperationException("Billing preview policy is missing.");
        return JsonSerializer.Deserialize<BillingPreviewPolicy>(stream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    });
    public static BillingPreviewPolicy Policy => Settings.Value;
    public static object Create(int users, DateTimeOffset now, BillingPreviewPolicy? policy = null)
    {
        var p = policy ?? Policy;
        if (users < 0 || p.MonthlyPerUserKrw < 0 || p.EventMonthlyPerUserKrw < 0 || p.AnnualDiscountPercent is < 0 or > 100)
            throw new InvalidOperationException("Invalid billing preview policy.");
        // End date is inclusive in Korea; an unspecified date is explicitly open-ended.
        var end = p.EventEndsOn is null ? (DateTimeOffset?)null : new DateTimeOffset(
            DateOnly.ParseExact(p.EventEndsOn, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(9));
        var active = p.EventEnabled && (!end.HasValue || now < end.Value);
        var annualMonthly = (long)p.MonthlyPerUserKrw * (100 - p.AnnualDiscountPercent) / 100;
        var monthlyUnit = active ? p.EventMonthlyPerUserKrw : p.MonthlyPerUserKrw;
        var annualUnit = (active ? p.EventMonthlyPerUserKrw : annualMonthly) * 12;
        return new { policy = p, asOf = now, eventEndsAt = end, eventActive = active, currentUsers = users,
            monthlyUnitKrw = monthlyUnit, annualUnitKrw = annualUnit,
            monthlyTotalKrw = (long)users * monthlyUnit, annualTotalKrw = users * annualUnit };
    }
}
