using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Organization;

// Responsibility is separate from the authenticated actor and historical name snapshots.
public static class BusinessAssignees
{
    public sealed class Member { public Guid Id { get; set; } public string Name { get; set; } = ""; public string Code { get; set; } = ""; public string? Email { get; set; } public string? CustomCode { get; set; } }
    static IQueryable<TenantMembership> Eligible(WmsDbContext db, Guid tenant) =>
        db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenant && x.IsActive && x.User.IsActive && x.AccountType == "Internal");
    static IQueryable<Member> View(WmsDbContext db, Guid tenant, bool historical = false) => (historical ? db.TenantMemberships.AsNoTracking().Where(x => x.TenantId == tenant) : Eligible(db, tenant)).Select(x => new Member {
        Id=x.UserId, Name=x.DisplayName ?? x.User.DisplayName, Code=x.User.UserName ?? "", Email=x.User.Email,
        CustomCode=db.Departments.Where(d => d.TenantId == tenant && d.Id == x.DepartmentId).Select(d => d.Name).FirstOrDefault() });
    public static Task<Member?> Saved(WmsDbContext db, Guid tenant, Guid user, CancellationToken ct) => View(db, tenant, true).SingleOrDefaultAsync(x => x.Id == user, ct);
    public static Task<Member?> Current(WmsDbContext db, Guid tenant, Guid actor, CancellationToken ct) => View(db, tenant).SingleOrDefaultAsync(x => x.Id == actor, ct);
    public static async Task<object> Choices(WmsDbContext db, Guid tenant, string? search, int page, CancellationToken ct)
    {
        if (search?.Length > 100 || page < 1 || page > 100000) throw new OrganizationException(400, "구성원 검색 조건을 확인해 주세요.");
        var term = search?.Trim().ToLowerInvariant() ?? "";
        var q = View(db, tenant);
        if (term.Length > 0) q = q.Where(x => x.Name.ToLower().Contains(term) || x.Code.ToLower().Contains(term) || (x.CustomCode != null && x.CustomCode.ToLower().Contains(term)) || (x.Email != null && x.Email.ToLower().Contains(term)));
        return new { items = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * 30).Take(30).ToListAsync(ct), total = await q.CountAsync(ct), page, pageSize = 30 };
    }
    public static async Task<(Guid? Id, string Name)> Resolve(WmsDbContext db, Guid tenant, Guid actor, Guid? requested, bool creating, Guid? previousId, string? previousName, CancellationToken ct)
    {
        // Old documents/clients keep their saved assignment, including inactive members and unlinked names.
        if (!creating && (!requested.HasValue || requested == previousId)) return (previousId, previousName ?? "");
        var id = requested ?? actor;
        var member = await Current(db, tenant, id, ct) ?? throw new OrganizationException(400, "현재 기업의 활성 내부 구성원을 담당자로 선택해 주세요.");
        return (member.Id, member.Name);
    }
}
