using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SaveCollaboratorPermissionsRequest(Guid Version, Dictionary<string, string[]> Grants, bool IsActive);

[ApiController, Route("api/tenants/{tenantId:guid}/collaborators"), Authorize(Policy = "TenantMaster")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class CollaboratorsController(WmsDbContext db, TimeProvider clock) : ControllerBase
{
    [HttpGet("choices")]
    public async Task<IActionResult> Choices(Guid tenantId, CancellationToken ct, string? search = null, int page = 1)
        => await CollaboratorQueries.Choices(db, tenantId, search, page, false, ct);

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid tenantId, Guid id, CancellationToken ct)
    {
        var group = await db.ExternalCollaborators.AsNoTracking().Include(x => x.Partner).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (group == null) return NotFound();
        return Ok(new { group.Id, group.Name, group.PartnerId, group.BusinessRegistrationNumber, group.Phone, group.IsActive, group.Version, group.UpdatedAt,
            partnerActive = group.Partner == null || group.Partner.IsActive,
            memberCount = await db.TenantMemberships.CountAsync(x => x.TenantId == tenantId && x.CollaboratorId == id, ct),
            grants = ExternalPermissionPolicy.Read(group.PermissionsJson), features = ExternalPermissionPolicy.Features.Select(f => new { f.Key, f.Label, actions = ExternalPermissionPolicy.Actions(f) }) });
    }
    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> Members(Guid tenantId, Guid id, CancellationToken ct, int page = 1)
    {
        if (page is < 1 or > 100000) return BadRequest();
        if (!await db.ExternalCollaborators.AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct)) return NotFound();
        var q = db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && x.CollaboratorId == id);
        return Ok(new { total = await q.CountAsync(ct), page, pageSize = 20, items = await q.OrderBy(x => x.DisplayName ?? x.User.DisplayName).ThenBy(x => x.UserId).Skip((page - 1) * 20).Take(20)
            .Select(x => new { x.UserId, name = x.DisplayName ?? x.User.DisplayName, loginId = x.User.UserName, isActive = x.IsActive && x.User.IsActive, x.UseIndividualPermissions }).ToListAsync(ct) });
    }
    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid tenantId, Guid id, CancellationToken ct, int page = 1)
    {
        if (page is < 1 or > 100000) return BadRequest();
        if (!await db.ExternalCollaborators.AnyAsync(x => x.TenantId == tenantId && x.Id == id, ct)) return NotFound();
        var q = db.CollaboratorPermissionChanges.AsNoTracking().Where(x => x.TenantId == tenantId && x.CollaboratorId == id);
        return Ok(new { total = await q.CountAsync(ct), page, pageSize = 20, items = await q.OrderByDescending(x => x.Id).Skip((page - 1) * 20).Take(20).ToListAsync(ct) });
    }
    [HttpPost("{id:guid}/permissions"), RequestSizeLimit(32768)]
    public async Task<IActionResult> Save(Guid tenantId, Guid id, SaveCollaboratorPermissionsRequest request, CancellationToken ct)
    {
        if (!ExternalPermissionPolicy.Valid(request.Grants)) return BadRequest(new { message = "허용 가능한 업무 권한과 메뉴·조회 권한을 확인하세요." });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await OrganizationStructureService.LockAsync(db, tenantId, ct);
        var actor = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.UserId == actor && x.Role == TenantRole.Master && x.AccountType == "Internal" && x.IsActive && x.User.IsActive, ct)) return Forbid();
        var group = await db.ExternalCollaborators.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
        if (group == null) return NotFound();
        if (group.Version != request.Version) return Conflict(new { message = "협력사 권한이 변경되었습니다. 최신 설정을 다시 불러오세요." });
        var grants = ExternalPermissionPolicy.Features.ToDictionary(f => f.Key, f => ExternalPermissionPolicy.Actions(f).Where(request.Grants[f.Key].Contains).ToArray());
        var before = JsonSerializer.Serialize(new { group.IsActive, grants = ExternalPermissionPolicy.Read(group.PermissionsJson) });
        var after = JsonSerializer.Serialize(new { request.IsActive, grants });
        if (before != after) {
            group.IsActive = request.IsActive; group.PermissionsJson = JsonSerializer.Serialize(grants);
            db.CollaboratorPermissionChanges.Add(new() { TenantId = tenantId, CollaboratorId = id, ChangedByUserId = actor, ChangedAt = clock.GetUtcNow(), BeforeJson = before, AfterJson = after });
            try { await db.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { return Conflict(new { message = "협력사 권한이 변경되었습니다. 다시 불러오세요." }); }
        }
        await tx.CommitAsync(ct);
        return Ok(new { group.Version, group.IsActive, grants });
    }
}

// Registration may select an existing stable relationship, but never read or edit its grants.
[ApiController, Route("api/tenants/{tenantId:guid}/users/collaborators"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:users:read")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class UserCollaboratorOptionsController(WmsDbContext db) : ControllerBase
{
    [HttpGet("choices")]
    public async Task<IActionResult> Choices(Guid tenantId, CancellationToken ct, string? search = null, int page = 1)
        => await CollaboratorQueries.Choices(db, tenantId, search, page, true, ct);
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid tenantId, Guid id, CancellationToken ct)
    {
        var group = await db.ExternalCollaborators.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
            .Select(x => new { x.Id, x.Name, x.PartnerId, x.BusinessRegistrationNumber, companyPhone = x.Phone, x.IsActive }).SingleOrDefaultAsync(ct);
        return group == null ? NotFound() : Ok(group);
    }
}
internal static class CollaboratorQueries
{
    internal static async Task<IActionResult> Choices(WmsDbContext db, Guid tenantId, string? search, int page, bool activeOnly, CancellationToken ct)
    {
        if (page is < 1 or > 100000 || search?.Length > 100) return new BadRequestResult();
        var q = db.ExternalCollaborators.AsNoTracking().Where(x => x.TenantId == tenantId);
        if (activeOnly) q = q.Where(x => x.IsActive && (x.PartnerId == null || x.Partner!.IsActive));
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLowerInvariant(); q = q.Where(x => x.Name.ToLower().Contains(term)); }
        var total = await q.CountAsync(ct);
        var rows = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * 30).Take(30).Select(x => new { x.Id, x.Name, x.IsActive, memberCount = db.TenantMemberships.Count(m => m.TenantId == tenantId && m.CollaboratorId == x.Id) }).ToListAsync(ct);
        return new OkObjectResult(new { items = rows.Select(x => new { x.Id, x.Name, x.IsActive, x.memberCount, code = $"소속 {x.memberCount}명 · {x.Id.ToString()[..8]}{(x.IsActive ? "" : " · 사용 중지")}" }), total, page, pageSize = 30 });
    }
}
