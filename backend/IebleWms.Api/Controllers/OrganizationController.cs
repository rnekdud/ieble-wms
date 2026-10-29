using System.Security.Claims;
using IebleWms.Api.Billing;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class OrganizationController(WmsDbContext db, CompanyService companies, EmployeeService employees, BillingAccessService billing, MasterTransferService transfer) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("company"), Authorize(Policy = "Permission:company:read")]
    public async Task<IActionResult> Company(Guid tenantId, CancellationToken token) => Ok(await companies.GetAsync(tenantId, token));

    [HttpPost("company"), Authorize(Policy = "Permission:company:update")]
    public async Task<IActionResult> UpdateCompany(Guid tenantId, UpdateCompanyRequest request, CancellationToken token) =>
        Ok(await companies.UpdateAsync(tenantId, Actor, request, token));

    [HttpPost("company/business-number"), Authorize(Policy = "TenantMaster")]
    public async Task<IActionResult> ChangeBusinessNumber(Guid tenantId, UpdateBusinessNumberRequest request, CancellationToken token) =>
        Ok(await companies.ChangeBusinessNumberAsync(tenantId, Actor, request, token));

    [HttpGet("users"), Authorize(Policy = "Permission:users:read")]
    public async Task<IActionResult> Users(Guid tenantId, CancellationToken token, [FromQuery] string? search = null,
        [FromQuery] string? role = null, [FromQuery] string status = "all", [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (page < 1 || page > 100000 || pageSize is < 1 or > 100 || search?.Length > 100 || status is not ("all" or "active" or "inactive")) return BadRequest();
        var query = db.TenantMemberships.AsNoTracking().Include(x => x.User).Where(x => x.TenantId == tenantId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(x => (x.DisplayName ?? x.User.DisplayName).ToLower().Contains(term) || x.User.Email!.ToLower().Contains(term) || x.User.UserName!.ToLower().Contains(term));
        }
        if (!string.IsNullOrEmpty(role))
        {
            if (role is not ("Master" or "Administrator" or "Employee")) return BadRequest();
            var selectedRole = Enum.Parse<TenantRole>(role); query = query.Where(x => x.Role == selectedRole);
        }
        if (status == "active") query = query.Where(x => x.IsActive && x.User.IsActive);
        if (status == "inactive") query = query.Where(x => !x.IsActive || !x.User.IsActive);
        var total = await query.CountAsync(token);
        var rows = await query.OrderBy(x => x.DisplayName ?? x.User.DisplayName).ThenBy(x => x.UserId).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(token);
        var departments = await db.Departments.AsNoTracking().Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.Id, x => x.Name, token);
        var positions = await db.JobPositions.AsNoTracking().Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.Id, x => x.Name, token);
        return Ok(new { items = rows.Select(x => EmployeeView.From(x, billing, departments.GetValueOrDefault(x.DepartmentId ?? Guid.Empty), positions.GetValueOrDefault(x.PositionId ?? Guid.Empty))), total, page, pageSize,
            monthlyPerUserKrw = billing.Policy.MonthlyPerUserKrw, billMasterAccounts = billing.Policy.BillMasterAccounts, billingTerminationPolicy = "Undecided" });
    }

    [HttpGet("users/master-transfer"), Authorize(Policy = "TenantMaster")]
    public async Task<IActionResult> TransferCandidates(Guid tenantId, CancellationToken token) => Ok(await transfer.Candidates(tenantId, Actor, token));

    [HttpPost("users/master-transfer"), Authorize(Policy = "TenantMaster"), Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("password-change")]
    public async Task<IActionResult> TransferMaster(Guid tenantId, TransferMasterRequest request, CancellationToken token)
    {
        await transfer.Transfer(tenantId, Actor, request, token);
        return Ok(new { message = "마스터 위임이 완료되었습니다. 본인은 기업 관리자로 변경되었습니다." });
    }

    [HttpPost("users"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:users:create")]
    public async Task<IActionResult> CreateUser(Guid tenantId, CreateEmployeeRequest request, CancellationToken token) =>
        StatusCode(201, await employees.CreateAsync(tenantId, Actor, request, token));

    [HttpPost("users/{userId:guid}"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:users:update")]
    public async Task<IActionResult> UpdateUser(Guid tenantId, Guid userId, UpdateEmployeeRequest request, CancellationToken token) =>
        Ok(await employees.UpdateAsync(tenantId, Actor, userId, request, token));

    [HttpPost("users/{userId:guid}/reset-password"), Authorize(Policy = "TenantAdministrator"), Authorize(Policy = "Permission:users:update")]
    public async Task<IActionResult> ResetPassword(Guid tenantId, Guid userId, ResetEmployeePasswordRequest request, CancellationToken token) =>
        Ok(await employees.ResetPasswordAsync(tenantId, Actor, userId, request.Version, token));
}
