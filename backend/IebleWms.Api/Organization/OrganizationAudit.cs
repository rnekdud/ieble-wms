using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;

namespace IebleWms.Api.Organization;

public sealed class OrganizationAudit(WmsDbContext db, TimeProvider clock)
{
    public void Add(Guid? tenantId, Guid actor, string action, object before, object after, Guid? targetUserId = null, string? reason = null) =>
        db.OrganizationChanges.Add(new OrganizationChange { TenantId = tenantId, ChangedByUserId = actor, TargetUserId = targetUserId,
            ChangedAt = clock.GetUtcNow(), Action = action, BeforeJson = JsonSerializer.Serialize(before), AfterJson = JsonSerializer.Serialize(after), Reason = reason });
}

public sealed class OrganizationException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
