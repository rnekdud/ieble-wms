using System.Text.Json;
using IebleWms.Api.Billing;
using Xunit;
namespace IebleWms.Api.Tests;
public sealed class BillingPricingPreviewTests
{
    private static JsonElement Read(int users, string time, BillingPreviewPolicy? policy = null) =>
        JsonSerializer.SerializeToElement(BillingPricingPreview.Create(users, DateTimeOffset.Parse(time), policy));
    [Theory]
    [InlineData(0, 0, 0)] [InlineData(1, 2000, 24000)] [InlineData(10, 20000, 240000)]
    public void OpenEventDoesNotStackAnnualDiscount(int users, long monthly, long annual)
    {
        var result = Read(users, "2026-11-20T00:00:00Z");
        Assert.Equal(monthly, result.GetProperty("monthlyTotalKrw").GetInt64());
        Assert.Equal(annual, result.GetProperty("annualTotalKrw").GetInt64());
        Assert.True(result.GetProperty("eventActive").GetBoolean());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("eventEndsAt").ValueKind);
        Assert.Equal(5000, BillingPricingPreview.Policy.MonthlyPerUserKrw);
        Assert.Equal(20, BillingPricingPreview.Policy.AnnualDiscountPercent);
    }
    [Theory]
    [InlineData("2026-11-20T14:59:59.999Z", true, 20000, 240000)]
    [InlineData("2026-11-20T15:00:00Z", false, 50000, 480000)]
    [InlineData("2026-11-21T00:00:00Z", false, 50000, 480000)]
    public void EndDateIsInclusiveInKorea(string time, bool active, long monthly, long annual)
    {
        var result = Read(10,time,BillingPricingPreview.Policy with { EventEndsOn = "2026-11-20" });
        Assert.Equal(active,result.GetProperty("eventActive").GetBoolean());
        Assert.Equal(monthly,result.GetProperty("monthlyTotalKrw").GetInt64());
        Assert.Equal(annual,result.GetProperty("annualTotalKrw").GetInt64());
    }
    [Fact]
    public void DisabledEventUsesRegularPricesAndInvalidPolicyFailsClosed()
    {
        var result = Read(10,"2026-11-20T00:00:00Z",BillingPricingPreview.Policy with { EventEnabled = false });
        Assert.Equal(50000,result.GetProperty("monthlyTotalKrw").GetInt64());
        Assert.Equal(480000,result.GetProperty("annualTotalKrw").GetInt64());
        Assert.Throws<InvalidOperationException>(() => BillingPricingPreview.Create(-1,DateTimeOffset.UtcNow));
        Assert.Throws<FormatException>(() => BillingPricingPreview.Create(1,DateTimeOffset.UtcNow,BillingPricingPreview.Policy with {EventEndsOn="not a date"}));
    }
}
