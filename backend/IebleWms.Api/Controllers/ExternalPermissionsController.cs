using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SaveExternalPermissionsRequest(Guid Version, Dictionary<string, string[]> Grants, bool UseIndividualPermissions = true);

[ApiController, Route("api/tenants/{tenantId:guid}/permissions/users/{userId:guid}"), Authorize(Policy = "TenantMaster")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ExternalPermissionsController(WmsDbContext db, OrganizationAudit audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(Guid tenantId, Guid userId, CancellationToken ct)
    {
        var member = await db.TenantMemberships.AsNoTracking().Include(x => x.Collaborator).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId && x.AccountType == "External", ct);
        if (member == null) return NotFound(new { message = "외부 협력사 사용자를 찾을 수 없습니다." });
        return Ok(new { member.Version, member.UseIndividualPermissions, member.CollaboratorId, collaboratorName = member.Collaborator?.Name, ceiling = ExternalPermissionPolicy.Read(member.Collaborator?.PermissionsJson ?? "{}"), grants = ExternalPermissionPolicy.Read(member.ExternalPermissionsJson), features = ExternalPermissionPolicy.Features.Select(f => new { f.Key, f.Label, actions = ExternalPermissionPolicy.Actions(f) }) });
    }
    [HttpPost, RequestSizeLimit(32768)]
    public async Task<IActionResult> Save(Guid tenantId, Guid userId, SaveExternalPermissionsRequest request, CancellationToken ct)
    {
        if (!ExternalPermissionPolicy.Valid(request.Grants)) return BadRequest(new { message = "허용 가능한 업무 권한과 메뉴·조회 권한을 확인하세요." });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await OrganizationStructureService.LockAsync(db, tenantId, ct);
        var actor = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        // A master transfer may have completed while this request waited for the tenant lock.
        if (!await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.UserId == actor && x.Role == Models.TenantRole.Master && x.AccountType == "Internal" && x.IsActive && x.User.IsActive, ct)) return Forbid();
        var member = await db.TenantMemberships.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId && x.AccountType == "External", ct);
        if (member == null) return NotFound();
        if (member.Version != request.Version) return Conflict(new { message = "사용자 또는 권한이 변경되었습니다. 최신 정보를 다시 불러오세요." });
        var before = ExternalPermissionPolicy.Read(member.ExternalPermissionsJson);
        var normalized = ExternalPermissionPolicy.Features.ToDictionary(f => f.Key, f => ExternalPermissionPolicy.Actions(f).Where(request.Grants[f.Key].Contains).ToArray());
        var json = JsonSerializer.Serialize(normalized);
        if (json != JsonSerializer.Serialize(before) || member.UseIndividualPermissions != request.UseIndividualPermissions) {
            var beforeRestriction = member.UseIndividualPermissions;
            member.UseIndividualPermissions = request.UseIndividualPermissions;
            member.ExternalPermissionsJson = json;
            audit.Add(tenantId, actor, "ExternalPermissionsUpdated", new { useIndividualPermissions = beforeRestriction, grants = before }, new { member.UseIndividualPermissions, grants = normalized }, userId);
            try { await db.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { return Conflict(new { message = "권한이 변경되었습니다. 다시 불러오세요." }); }
        }
        await tx.CommitAsync(ct);
        return Ok(new { member.Version, member.UseIndividualPermissions, grants = normalized });
    }
}
