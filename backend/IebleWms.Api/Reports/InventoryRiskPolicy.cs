namespace IebleWms.Api.Reports;

public static class InventoryRiskPolicy
{
    public const decimal NearSafetyRatio = .10m;
    public const int ExpirySoonDays = 30;
    public static string Stock(decimal expected, decimal? safety, bool comparable = true) =>
        !comparable || safety is null ? "review" : safety <= 0 ? "safe" :
        expected < safety ? "danger" : expected <= safety * (1 + NearSafetyRatio) ? "warning" : "safe";
    public static string Expiry(DateOnly? expiry, DateOnly today) => expiry is null ? "safe" :
        expiry < today ? "danger" : expiry <= today.AddDays(ExpirySoonDays) ? "warning" : "safe";
    public static int Priority(string status) => status switch { "danger" => 4, "warning" => 3, "review" => 2, "safe" => 1, _ => 0 };
    public static string Highest(IEnumerable<string> statuses) => statuses.OrderByDescending(Priority).FirstOrDefault() ?? "empty";
}
