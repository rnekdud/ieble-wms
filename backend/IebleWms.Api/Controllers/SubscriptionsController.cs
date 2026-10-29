using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using IebleWms.Api.Billing;
using IebleWms.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/subscription"), Authorize(Policy = "TenantMaster")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class SubscriptionsController(SubscriptionService subscriptions) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet] public async Task<IActionResult> Read(Guid tenantId, CancellationToken ct) => Ok(await subscriptions.Read(tenantId, Actor, ct));
    [HttpPost("dismiss")] public async Task<IActionResult> Dismiss(Guid tenantId, CancellationToken ct) { await subscriptions.Dismiss(tenantId, Actor, ct); return Ok(new { message = "오늘은 다시 안내하지 않습니다." }); }
    [HttpPost("feedback")] public async Task<IActionResult> Feedback(Guid tenantId, FeedbackRequest request, CancellationToken ct) { await subscriptions.SaveFeedback(tenantId, Actor, request.RequestId, request.Message, ct); return Ok(new { message = "저장했습니다." }); }
    [HttpPost("cancel")] public async Task<IActionResult> Cancel(Guid tenantId, CancellationToken ct) { await subscriptions.Cancel(tenantId, Actor, ct); return Ok(new { message = "다음 정기결제부터 자동 청구가 중단됩니다." }); }
}
public sealed class FeedbackRequest
{
    public Guid RequestId { get; set; }
    [StringLength(2000)] public string? Message { get; set; }
}
[ApiController, Route("api/admin/billing-feedback"), Authorize(Policy = "IebleAdministrator")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class BillingFeedbackController(WmsDbContext db) : ControllerBase
{
    [HttpGet] public async Task<IActionResult> List([FromQuery, Range(1, 100000)] int page = 1, CancellationToken ct = default)
    {
        var query = from f in db.BillingFeedbacks.AsNoTracking() join t in db.Tenants on f.TenantId equals t.Id join u in db.Users on f.UserId equals u.Id
                    select new { f.Id, f.TenantId, company = t.Name, author = u.DisplayName, f.Message, f.CreatedAt };
        return Ok(new { items = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip((page - 1) * 20).Take(20).ToListAsync(ct), total = await query.CountAsync(ct) });
    }
}
