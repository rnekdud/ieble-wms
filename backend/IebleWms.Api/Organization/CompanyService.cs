using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Organization;

public sealed class CompanyService(WmsDbContext db, OrganizationAudit audit)
{
    public static object View(Tenant t) => new { t.Id, t.Name, t.RepresentativeName, t.BusinessRegistrationNumber, t.Address, t.ContactName, t.ContactPhone, t.Version };

    public async Task<object> GetAsync(Guid tenantId, CancellationToken token)
    {
        var tenant = await db.Tenants.AsNoTracking().SingleAsync(x => x.Id == tenantId, token);
        // Only company-information events are exposed here, never password/user/permission events.
        var query = db.OrganizationChanges.AsNoTracking()
            .Where(x => x.TenantId == tenantId && (x.Action == "CompanyUpdated" || x.Action == "BusinessNumberChanged"))
            .OrderByDescending(x => x.Id)
            .Select(x => new { x.Id, x.Action, x.ChangedByUserId,
                changedByName = db.TenantMemberships.Where(m => m.TenantId == tenantId && m.UserId == x.ChangedByUserId)
                    .Select(m => m.DisplayName ?? m.User.DisplayName).FirstOrDefault() ?? "이전 담당자",
                x.ChangedAt, x.BeforeJson, x.AfterJson, x.Reason });
        var history = await query.Take(20).ToListAsync(token);
        var businessNumberHistory = await query.Where(x => x.Action == "BusinessNumberChanged").Take(20).ToListAsync(token);
        return new { company = View(tenant), history, businessNumberHistory };
    }

    public async Task<object> UpdateAsync(Guid tenantId, Guid actor, UpdateCompanyRequest request, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) throw new OrganizationException(400, "기업명을 입력해 주세요.");
        var tenant = await db.Tenants.SingleAsync(x => x.Id == tenantId, token);
        if (tenant.Version != request.Version) throw Stale();
        var before = View(tenant);
        tenant.Name = request.Name.Trim(); tenant.RepresentativeName = Clean(request.RepresentativeName);
        tenant.Address = Clean(request.Address); tenant.ContactName = Clean(request.ContactName); tenant.ContactPhone = Clean(request.ContactPhone);
        if (JsonSerializer.Serialize(before) == JsonSerializer.Serialize(View(tenant))) return View(tenant);
        audit.Add(tenantId, actor, "CompanyUpdated", before, View(tenant));
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        return View(tenant);
    }

    public async Task<object> ChangeBusinessNumberAsync(Guid tenantId, Guid actor, UpdateBusinessNumberRequest request, CancellationToken token)
    {
        var normalized = BusinessRegistrationNumber.Normalize(request.BusinessRegistrationNumber);
        if (!BusinessRegistrationNumber.IsValid(normalized) || string.IsNullOrWhiteSpace(request.Reason))
            throw new OrganizationException(400, "사업자등록번호와 변경 사유를 확인해 주세요.");
        var tenant = await db.Tenants.SingleAsync(x => x.Id == tenantId, token);
        if (tenant.Version != request.Version) throw Stale();
        if (tenant.BusinessRegistrationNumber == normalized) return View(tenant);
        if (await db.Tenants.AnyAsync(x => x.Id != tenantId && x.BusinessRegistrationNumber == normalized, token)) throw DuplicateNumber();
        var before = new { tenant.BusinessRegistrationNumber };
        tenant.BusinessRegistrationNumber = normalized;
        audit.Add(tenantId, actor, "BusinessNumberChanged", before, new { tenant.BusinessRegistrationNumber }, reason: request.Reason.Trim());
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw Stale(); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: "23505" }) { throw DuplicateNumber(); }
        return View(tenant);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static OrganizationException Stale() => new(409, "기업 정보가 변경되었습니다. 최신 정보를 다시 불러와 주세요.");
    private static OrganizationException DuplicateNumber() => new(409, "이미 등록된 사업자등록번호입니다.");
}
