using System.Text;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Organization;

public sealed class OrganizationStructureService(WmsDbContext db, OrganizationAudit audit)
{
    // All hierarchy/assignment writers share this transaction-scoped tenant lock.
    // Cross-tenant FK constraints remain the final line of defense.
    public static async Task LockAsync(WmsDbContext db, Guid tenantId, CancellationToken token)
    {
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({tenantId.ToString()}, 0))", token);
    }
    public async Task ValidateAssignmentAsync(Guid tenantId, Guid? department, Guid? position, Guid? previousDepartment, Guid? previousPosition, CancellationToken token)
    {
        if (department is Guid d && !await db.Departments.AnyAsync(x => x.TenantId == tenantId && x.Id == d && (x.IsActive || d == previousDepartment), token))
            throw new OrganizationException(400, "현재 기업의 사용 중인 부서를 선택해 주세요.");
        if (position is Guid p && !await db.JobPositions.AnyAsync(x => x.TenantId == tenantId && x.Id == p && (x.IsActive || p == previousPosition), token))
            throw new OrganizationException(400, "현재 기업의 사용 중인 직급을 선택해 주세요.");
    }
    public async Task<object> ListAsync(Guid tenantId, CancellationToken token) => new {
        departments = await db.Departments.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.Name, x.ParentId, x.SortOrder, x.IsActive, x.Version,
                memberCount = db.TenantMemberships.Count(m => m.TenantId == tenantId && m.DepartmentId == x.Id),
                childCount = db.Departments.Count(d => d.TenantId == tenantId && d.ParentId == x.Id) }).ToListAsync(token),
        positions = await db.JobPositions.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.Name, x.SortOrder, x.IsActive, x.Version,
                memberCount = db.TenantMemberships.Count(m => m.TenantId == tenantId && m.PositionId == x.Id) }).ToListAsync(token)
    };
    public async Task<object> ChartAsync(Guid tenantId, CancellationToken token) => new {
        departments = await db.Departments.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.Name, x.ParentId, x.IsActive, x.SortOrder }).ToListAsync(token),
        employees = await db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && x.User.IsActive)
            .OrderBy(x => x.DisplayName ?? x.User.DisplayName).ThenBy(x => x.UserId)
            .Select(x => new { x.UserId, name = x.DisplayName ?? x.User.DisplayName, x.DepartmentId, x.PositionId,
                positionName = db.JobPositions.Where(p => p.TenantId == tenantId && p.Id == x.PositionId).Select(p => p.Name).FirstOrDefault() }).ToListAsync(token)
    };
    private static object Snapshot(Department x) => new { x.Id, x.Name, x.ParentId, x.SortOrder, x.IsActive };
    private static object Snapshot(JobPosition x) => new { x.Id, x.Name, x.SortOrder, x.IsActive };
    public async Task<object> SaveAsync(Guid tenantId, Guid actor, string kind, Guid? id, OrganizationItemRequest request, CancellationToken token)
    {
        if (kind is not ("departments" or "positions")) throw new OrganizationException(404, "항목을 찾을 수 없습니다.");
        var name = request.Name.Trim().Normalize(NormalizationForm.FormKC);
        if (name.Length is < 1 or > 100 || request.SortOrder is < 0 or > 100000) throw new OrganizationException(400, "항목 이름과 정렬 순서를 확인해 주세요.");
        var normalized = name.ToUpperInvariant();
        await using var tx = await db.Database.BeginTransactionAsync(token);
        await LockAsync(db, tenantId, token);
        object before = new { }; object after; AuditableEntity item;
        if (kind == "departments")
        {
            var rows = await db.Departments.Where(x => x.TenantId == tenantId).ToListAsync(token);
            var current = id.HasValue ? rows.SingleOrDefault(x => x.Id == id) ?? throw Missing() : new Department { TenantId = tenantId };
            if (id.HasValue && current.Version != request.Version) throw Stale();
            if (rows.Any(x => x.Id != current.Id && x.NormalizedName == normalized)) throw Duplicate();
            var seen = new HashSet<Guid> { current.Id }; var parentId = request.ParentId;
            while (parentId is Guid p)
            {
                if (!seen.Add(p)) throw new OrganizationException(400, "자기 자신이나 하위 부서를 상위 부서로 지정할 수 없습니다.");
                var parent = rows.SingleOrDefault(x => x.Id == p) ?? throw new OrganizationException(400, "현재 기업의 상위 부서를 선택해 주세요.");
                if (p == request.ParentId && !parent.IsActive && (request.IsActive || current.ParentId != p)) throw new OrganizationException(400, "사용 중인 상위 부서를 선택해 주세요.");
                parentId = parent.ParentId;
            }
            if (!request.IsActive && rows.Any(x => x.ParentId == current.Id && x.IsActive)) throw new OrganizationException(409, "사용 중인 하위 부서를 먼저 이동하거나 사용 중지해 주세요.");
            if (id.HasValue) before = Snapshot(current); else db.Departments.Add(current);
            current.Name = name; current.NormalizedName = normalized; current.ParentId = request.ParentId; current.SortOrder = request.SortOrder; current.IsActive = request.IsActive;
            after = Snapshot(current); item = current;
        }
        else
        {
            if (request.ParentId != null) throw new OrganizationException(400, "직급에는 상위 항목을 지정할 수 없습니다.");
            var current = id.HasValue ? await db.JobPositions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, token) ?? throw Missing() : new JobPosition { TenantId = tenantId };
            if (id.HasValue && current.Version != request.Version) throw Stale();
            if (await db.JobPositions.AnyAsync(x => x.TenantId == tenantId && x.Id != current.Id && x.NormalizedName == normalized, token)) throw Duplicate();
            if (id.HasValue) before = Snapshot(current); else db.JobPositions.Add(current);
            current.Name = name; current.NormalizedName = normalized; current.SortOrder = request.SortOrder; current.IsActive = request.IsActive;
            after = Snapshot(current); item = current;
        }
        if (!id.HasValue || JsonSerializer.Serialize(before) != JsonSerializer.Serialize(after))
        {
            audit.Add(tenantId, actor, (kind == "departments" ? "Department" : "Position") + (id.HasValue ? "Updated" : "Created"), before, after);
            await SaveChangesAsync(token);
        }
        await tx.CommitAsync(token);
        return new { item.Version };
    }
    public async Task DeleteAsync(Guid tenantId, Guid actor, string kind, Guid id, Guid version, CancellationToken token)
    {
        await using var tx = await db.Database.BeginTransactionAsync(token); await LockAsync(db, tenantId, token);
        object before;
        if (kind == "departments")
        {
            var item = await db.Departments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, token) ?? throw Missing();
            if (item.Version != version) throw Stale();
            if (await db.Departments.AnyAsync(x => x.TenantId == tenantId && x.ParentId == id, token) || await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.DepartmentId == id, token)) throw InUse();
            before = Snapshot(item); db.Departments.Remove(item);
        }
        else if (kind == "positions")
        {
            var item = await db.JobPositions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, token) ?? throw Missing();
            if (item.Version != version) throw Stale();
            if (await db.TenantMemberships.AnyAsync(x => x.TenantId == tenantId && x.PositionId == id, token)) throw InUse();
            before = Snapshot(item); db.JobPositions.Remove(item);
        }
        else throw Missing();
        audit.Add(tenantId, actor, kind == "departments" ? "DepartmentDeleted" : "PositionDeleted", before, new { });
        await SaveChangesAsync(token); await tx.CommitAsync(token);
    }
    private async Task SaveChangesAsync(CancellationToken token)
    {
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23505" }) { throw Duplicate(); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23503" }) { throw InUse(); }
    }
    private static OrganizationException Missing() => new(404, "현재 기업에서 해당 항목을 찾을 수 없습니다.");
    private static OrganizationException Stale() => new(409, "항목이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
    private static OrganizationException Duplicate() => new(409, "현재 기업에 같은 이름의 항목이 있습니다.");
    private static OrganizationException InUse() => new(409, "직원 또는 하위 부서가 사용 중인 항목은 삭제할 수 없습니다. 사용 중지를 이용해 주세요.");
}
