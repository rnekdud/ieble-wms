using System.Security.Claims;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

public sealed record SavePermissionsRequest(Guid Version, Dictionary<string, Dictionary<string, string[]>> Roles);

[ApiController, Route("api/tenants/{tenantId:guid}/permissions"), Authorize(Policy = "TenantMaster")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class TenantPermissionsController(WmsDbContext db, TenantPermissionService permissions, TimeProvider clock) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(Guid tenantId, CancellationToken token)
    {
        var row = await db.TenantPermissionSettings.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId, token);
        return Ok(new { version = row?.Version ?? Guid.Empty, roles = await permissions.ReadAsync(tenantId, token),
            defaults = PermissionCatalog.Defaults(), features = PermissionCatalog.Features, row?.UpdatedAt });
    }

    [HttpPost]
    [RequestSizeLimit(65536)]
    public async Task<IActionResult> Save(Guid tenantId, SavePermissionsRequest request, CancellationToken token)
    {
        if (!PermissionCatalog.IsValid(request.Roles))
            return BadRequest(new { message = "권한 형식을 확인해 주세요. 기업 관리자와 일반 직원만 설정할 수 있으며 메뉴 및 조회 권한이 필요합니다." });
        var row = await db.TenantPermissionSettings.SingleOrDefaultAsync(x => x.TenantId == tenantId, token);
        if ((row?.Version ?? Guid.Empty) != request.Version) return Stale();
        var before = await permissions.ReadAsync(tenantId, token);
        // Normalize key/action order so equivalent saves do not produce spurious audit records.
        var normalized = PermissionCatalog.EditableRoles.ToDictionary(r => r,
            r => PermissionCatalog.Features.ToDictionary(f => f.Key, f => f.Actions.Where(a => request.Roles[r][f.Key].Contains(a)).ToArray()));
        var beforeJson = JsonSerializer.Serialize(before);
        var afterJson = JsonSerializer.Serialize(normalized);
        if (beforeJson == afterJson) return Ok(new { version = row?.Version ?? Guid.Empty, roles = before });
        var now = clock.GetUtcNow();
        var actor = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (row is null) { row = new TenantPermissionSettings { TenantId = tenantId }; db.TenantPermissionSettings.Add(row); }
        row.RolesJson = afterJson; row.Version = Guid.NewGuid(); row.UpdatedAt = now; row.UpdatedByUserId = actor;
        db.TenantPermissionChanges.Add(new TenantPermissionChange { TenantId = tenantId, ChangedByUserId = actor, ChangedAt = now,
            BeforeJson = beforeJson, AfterJson = afterJson, Version = row.Version });
        // One SaveChanges transaction commits both the current settings and immutable before/after history.
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { return Stale(); }
        catch (DbUpdateException error) when (error.InnerException is Npgsql.PostgresException { SqlState: "23505" }) { return Stale(); }
        return Ok(new { row.Version, roles = normalized });
    }

    private ConflictObjectResult Stale() => Conflict(new { message = "다른 창에서 권한이 변경되었습니다. 최신 설정을 다시 불러온 뒤 저장해 주세요." });
}
