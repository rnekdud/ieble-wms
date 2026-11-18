using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Organization;

public sealed partial class EmployeeService
{
    private async Task ValidateExternal(Guid tenant, string type, string role, Guid? department, Guid? position, Guid? partner, string? company, Guid? previousPartner, CancellationToken ct)
    {
        if (type is not ("Internal" or "External")) throw new OrganizationException(400, "계정 유형을 확인하세요.");
        if (type == "Internal") return;
        if (role != "Employee" || department.HasValue || position.HasValue)
            throw new OrganizationException(400, "외부 협력사는 관리자 권한이나 내부 부서·직급을 지정할 수 없습니다.");
        if (string.IsNullOrWhiteSpace(company) || company.Any(char.IsControl)) throw new OrganizationException(400, "소속 업체명을 입력하세요.");
        if (partner.HasValue && !await db.Partners.AnyAsync(x => x.Id == partner && x.TenantId == tenant && (x.IsActive || partner == previousPartner), ct))
            throw new OrganizationException(400, "현재 기업의 사용 가능한 거래처를 선택하세요.");
    }
    private static void ApplyExternal(TenantMembership member, string type, Guid? partner, string? company, string? businessNumber, string? companyPhone, string? contactPhone, string? contactEmail)
    {
        if (member.AccountType != type || type == "Internal") member.ExternalPermissionsJson = "{}";
        member.AccountType = type;
        member.PartnerId = type == "External" ? partner : null;
        static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        member.CompanyName = type == "External" ? Clean(company) : null;
        member.BusinessRegistrationNumber = type == "External" ? Clean(businessNumber) : null;
        member.CompanyPhone = type == "External" ? Clean(companyPhone) : null;
        member.ContactPhone = contactPhone;
        member.ContactEmail = type == "External" ? Clean(contactEmail) : null;
    }
}

public sealed partial class EmployeeService
{
    private async Task<ExternalCollaborator?> ResolveCollaborator(Guid tenant, string type, Guid? id, Guid? partner, string? name, string? businessNumber, string? phone, TenantMembership? previous, CancellationToken ct)
    {
        if (type != "External") return null;
        ExternalCollaborator? group = null;
        if (id.HasValue) group = await db.ExternalCollaborators.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct)
            ?? throw new OrganizationException(400, "현재 기업의 외부 협력사를 선택하세요.");
        else if (previous?.CollaboratorId != null && partner == previous.PartnerId && name?.Trim() == previous.CompanyName)
            group = await db.ExternalCollaborators.SingleAsync(x => x.TenantId == tenant && x.Id == previous.CollaboratorId, ct);
        else if (partner.HasValue) group = await db.ExternalCollaborators.SingleOrDefaultAsync(x => x.TenantId == tenant && x.PartnerId == partner, ct);
        if (group != null) {
            if (!group.IsActive && previous?.CollaboratorId != group.Id) throw new OrganizationException(409, "사용 중지된 협력사에는 계정을 새로 연결할 수 없습니다.");
            return group;
        }
        var linked = partner.HasValue ? await db.Partners.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == partner && x.IsActive, ct) : null;
        if (partner.HasValue && linked == null) throw new OrganizationException(400, "현재 기업의 활성 거래처를 선택하세요.");
        if (string.IsNullOrWhiteSpace(name)) throw new OrganizationException(400, "소속 업체명을 입력하세요.");
        group = new ExternalCollaborator { TenantId = tenant, PartnerId = partner, Name = linked?.Name ?? name.Trim(), BusinessRegistrationNumber = linked?.BusinessRegistrationNumber ?? businessNumber?.Trim(), Phone = linked?.Phone ?? phone?.Trim() };
        db.ExternalCollaborators.Add(group);
        return group;
    }
    private static void BindCollaborator(TenantMembership member, ExternalCollaborator? group)
    {
        if (member.CollaboratorId != group?.Id) { member.ExternalPermissionsJson = "{}"; member.UseIndividualPermissions = false; }
        member.CollaboratorId = group?.Id;
        if (group != null) { member.PartnerId = group.PartnerId; member.CompanyName = group.Name; member.BusinessRegistrationNumber = group.BusinessRegistrationNumber; member.CompanyPhone = group.Phone; }
    }
}
