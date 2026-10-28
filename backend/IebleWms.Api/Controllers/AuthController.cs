using System.Security.Claims;
using IebleWms.Api.Auth;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/auth"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AuthController(WmsDbContext db, UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signIn, CompanyRegistrationService registration, MembershipAccessService access, TenantSessionService tenants, IOptions<LoginSessionOptions> sessionOptions, TimeProvider clock) : ControllerBase
{
    [HttpGet("csrf"), AllowAnonymous]
    public IActionResult Csrf([FromServices] IAntiforgery antiforgery) =>
        Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [HttpPost("register"), AllowAnonymous, EnableRateLimiting("register")]
    public async Task<IActionResult> Register(RegisterCompanyRequest request, CancellationToken token)
    {
        if (User.Identity?.IsAuthenticated == true) return Conflict(new { message = "로그아웃 후 기업 가입을 진행해 주세요." });
        var result = await registration.RegisterAsync(request, token);
        if (!result.Succeeded) return StatusCode(result.Conflict ? 409 : 400, new { message = result.Message, code = result.Code });
        return StatusCode(201, new { message = "기업 가입이 완료되었습니다. 로그인하여 활성화 상태를 확인해 주세요." });
    }

    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null || !user.IsActive) return Unauthorized(new { message = "이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요." });
        var result = await signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded) return Unauthorized(new { message = "이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요." });
        var selected = await tenants.ResolveAsync(user.Id);
        var now = clock.GetUtcNow();
        await tenants.IssueAsync(user, selected, new AuthenticationProperties
        {
            IsPersistent = request.RememberMe,
            IssuedUtc = now,
            ExpiresUtc = request.RememberMe ? now.AddDays(sessionOptions.Value.PersistentDays) : now.AddHours(sessionOptions.Value.SessionHours),
            AllowRefresh = false
        });
        return Ok(new { message = "로그인되었습니다." });
    }

    [HttpGet("me"), Authorize]
    public async Task<IActionResult> Me(CancellationToken token)
    {
        var user = (await users.GetUserAsync(User))!;
        var memberships = await db.TenantMemberships.AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive && x.Tenant.IsActive)
            .Select(x => new { tenantId = x.TenantId, name = x.Tenant.Name, role = x.Role.ToString(), x.IsDefault, serviceStatus = x.Tenant.ServiceStatus.ToString() })
            .ToListAsync(token);
        var selected = await tenants.ResolveAsync(user.Id, token);
        var claimed = Guid.TryParse(User.FindFirstValue(AuthConfiguration.TenantClaim), out var claimId) ? (Guid?)claimId : null;
        if (selected != claimed)
        {
            var ticket = await HttpContext.AuthenticateAsync(IdentityConstants.ApplicationScheme);
            await tenants.IssueAsync(user, selected, ticket.Properties!);
        }
        return Ok(new { user = new { user.Id, user.DisplayName, user.Email, systemRole = user.SystemRole.ToString() }, memberships, selectedTenantId = selected, tenantResolution = selected.HasValue ? "resolved" : memberships.Count > 1 ? "default_required" : "no_membership" });
    }

    [HttpPost("default-tenant"), HttpPost("select-tenant"), Authorize]
    public async Task<IActionResult> SetDefaultTenant(SelectTenantRequest request, CancellationToken token)
    {
        var user = (await users.GetUserAsync(User))!;
        if (await access.GetTenantRoleAsync(user.Id, request.TenantId, token) is null) return Forbid();
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        try
        {
            var memberships = await db.TenantMemberships.Where(x => x.UserId == user.Id).ToListAsync(token);
            foreach (var membership in memberships.Where(x => x.IsDefault && x.TenantId != request.TenantId)) membership.IsDefault = false;
            await db.SaveChangesAsync(token);
            memberships.Single(x => x.TenantId == request.TenantId).IsDefault = true;
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(token);
            return Conflict(new { message = "기본 기업 지정이 충돌했습니다. 새로고침 후 다시 시도해 주세요." });
        }
        var ticket = await HttpContext.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        await tenants.IssueAsync(user, request.TenantId, ticket.Properties!);
        return Ok(new { tenantId = request.TenantId });
    }

    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout()
    {
        var user = (await users.GetUserAsync(User))!;
        // Revoke all previously issued tickets, including a copied cookie.
        var result = await users.UpdateSecurityStampAsync(user);
        if (!result.Succeeded) return StatusCode(503, new { message = "로그아웃 처리에 실패했습니다. 다시 시도해 주세요." });
        await HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
        return NoContent();
    }
}
