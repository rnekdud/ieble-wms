using System.Text;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Permissions;

public sealed record PermissionGradeView(string Id, string Name, string? Description, bool IsActive, bool IsBuiltIn, int MemberCount, Guid Version);
public sealed class PermissionGradeService(WmsDbContext db, OrganizationAudit audit)
{
    public static readonly Dictionary<string, string> BuiltIns = new() { ["Administrator"] = "기업 관리자", ["Employee"] = "일반 직원" };
    public async Task<List<PermissionGradeView>> ListAsync(Guid tenantId, CancellationToken token)
    {
        var rows = await db.PermissionGrades.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(token);
        var members = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && x.AccountType == "Internal")
            .Select(x => new { x.Role, x.PermissionGradeId }).ToListAsync(token);
        var result = BuiltIns.Select(b => {
            var row = rows.SingleOrDefault(x => x.SystemRole == b.Key);
            return new PermissionGradeView(b.Key, row?.Name ?? b.Value, row?.Description, row?.IsActive ?? true, true,
                members.Count(x => x.PermissionGradeId == null && x.Role.ToString() == b.Key), row?.Version ?? Guid.Empty);
        }).ToList();
        result.AddRange(rows.Where(x => x.SystemRole == null).OrderBy(x => x.Name).Select(x => new PermissionGradeView(x.Id.ToString(), x.Name, x.Description, x.IsActive, false, members.Count(m => m.PermissionGradeId == x.Id), x.Version)));
        return result;
    }
    public async Task<PermissionGradeView> SaveAsync(Guid tenantId, Guid actor, string? key, Contracts.PermissionGradeRequest request, CancellationToken token)
    {
        await using var tx = await db.Database.BeginTransactionAsync(token);
        await OrganizationStructureService.LockAsync(db, tenantId, token);
        var name = request.Name.Trim().Normalize(NormalizationForm.FormKC);
        if (name.Length is 0 or > 100 || name.Any(char.IsControl) || name is "기업 마스터" or "아이블 관리자")
            throw new OrganizationException(400, "사용할 수 없는 권한명입니다.");
        var all = await ListAsync(tenantId, token);
        if (all.Any(x => x.Id != key && x.Name.Normalize(NormalizationForm.FormKC).ToUpperInvariant() == name.ToUpperInvariant()))
            throw new OrganizationException(409, "동일한 권한명이 있습니다.");
        var builtin = key != null && BuiltIns.ContainsKey(key);
        PermissionGrade? row = key == null ? null : builtin
            ? await db.PermissionGrades.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SystemRole == key, token)
            : Guid.TryParse(key, out var id) ? await db.PermissionGrades.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.SystemRole == null, token) : null;
        if (key != null && !builtin && row == null) throw new OrganizationException(404, "권한 등급을 찾을 수 없습니다.");
        if ((row?.Version ?? Guid.Empty) != request.Version) throw new OrganizationException(409, "권한 등급이 변경되었습니다. 다시 불러와 주세요.");
        if (!request.IsActive && all.Any(x => x.Id == key && x.MemberCount > 0))
            throw new OrganizationException(409, "사용 중인 권한입니다. 연결된 사용자를 다른 권한으로 재배정한 뒤 사용 중지해 주세요.");
        var before = all.SingleOrDefault(x => x.Id == key);
        if (row == null) { row = new PermissionGrade { TenantId = tenantId, SystemRole = builtin ? key : null }; db.PermissionGrades.Add(row); }
        row.Name = name; row.NormalizedName = name.ToUpperInvariant(); row.Description = request.Description?.Trim(); row.IsActive = request.IsActive;
        audit.Add(tenantId, actor, key == null ? "PermissionGradeCreated" : "PermissionGradeUpdated", before ?? (object)new {}, new { row.Id, row.SystemRole, row.Name, row.Description, row.IsActive });
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw new OrganizationException(409, "권한 등급이 변경되었습니다. 다시 불러와 주세요."); }
        catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: "23505" }) { throw new OrganizationException(409, "동일한 권한명이 있습니다."); }
        await tx.CommitAsync(token);
        return (await ListAsync(tenantId, token)).Single(x => x.Id == (row.SystemRole ?? row.Id.ToString()));
    }
    // Retain grade IDs and audit history: retirement is explicit deactivation, never cascade deletion.
    public async Task ValidateAssignment(Guid tenantId, string role, string accountType, Guid? id, bool changed, CancellationToken token)
    {
        if (id != null) {
            if (accountType != "Internal" || role != "Employee") throw new OrganizationException(400, "사용자 정의 권한은 내부 직원에게만 지정할 수 있습니다.");
            if (!await db.PermissionGrades.AnyAsync(x => x.TenantId == tenantId && x.Id == id && x.SystemRole == null && (x.IsActive || !changed), token))
                throw new OrganizationException(400, "선택한 권한 등급을 사용할 수 없습니다.");
        } else if (changed && accountType == "Internal" && await db.PermissionGrades.AnyAsync(x => x.TenantId == tenantId && x.SystemRole == role && !x.IsActive, token))
            throw new OrganizationException(400, "사용 중지된 권한 등급입니다.");
    }
}
