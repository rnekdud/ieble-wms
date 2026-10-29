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
    [HttpGet("csrf"), AllowAnonymous, AllowPendingPasswordChange]
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

    [HttpPost("login"), AllowAnonymous, AllowPendingPasswordChange, EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var identifier = request.Email.Trim();
        var user = identifier.Contains('@') ? await users.FindByEmailAsync(identifier) : await users.FindByNameAsync(identifier);
        if (user is null || !user.IsActive || !await access.CanAuthenticateAsync(user.Id)) return Unauthorized(new { message = "이메일 또는 비밀번호를 확인해 주세요. 반복 실패 시 잠시 후 다시 시도해 주세요." });
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
        return Ok(new { message = "로그인되었습니다.", user.MustChangePassword });
    }

    [HttpGet("me"), Authorize, AllowPendingPasswordChange]
    public async Task<IActionResult> Me(CancellationToken token)
    {
        var user = (await users.GetUserAsync(User))!;
        var memberships = await db.TenantMemberships.AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive && x.Tenant.IsActive)
            .Select(x => new { tenantId = x.TenantId, name = x.Tenant.Name, role = x.Role.ToString(), x.IsDefault, serviceStatus = x.Tenant.ServiceStatus.ToString() })
            .ToListAsync(token);
        var selected = await tenants.ResolveAsync(user.Id, token);
        var displayName = selected is Guid selectedId
            ? await db.TenantMemberships.AsNoTracking().Where(x => x.UserId == user.Id && x.TenantId == selectedId)
                .Select(x => x.DisplayName ?? user.DisplayName).SingleAsync(token)
            : user.DisplayName;
        var claimed = Guid.TryParse(User.FindFirstValue(AuthConfiguration.TenantClaim), out var claimId) ? (Guid?)claimId : null;
        if (selected != claimed)
        {
            var ticket = await HttpContext.AuthenticateAsync(IdentityConstants.ApplicationScheme);
            await tenants.IssueAsync(user, selected, ticket.Properties!);
        }
        return Ok(new { user = new { user.Id, displayName, user.Email, user.UserName, user.MustChangePassword, systemRole = user.SystemRole.ToString() }, memberships, selectedTenantId = selected, tenantResolution = selected.HasValue ? "resolved" : memberships.Count > 1 ? "default_required" : "no_membership" });
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

    [HttpPost("change-password"), Authorize, AllowPendingPasswordChange, EnableRateLimiting("password-change")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, [FromServices] IebleWms.Api.Organization.OrganizationAudit audit, CancellationToken token)
    {
        var user = (await users.GetUserAsync(User))!;
        if (request.CurrentPassword == request.NewPassword || string.Equals(request.NewPassword, user.UserName, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "현재 비밀번호, 로그인 아이디 및 초기 비밀번호와 다른 개인 비밀번호를 입력해 주세요." });
        var verified = await signIn.CheckPasswordSignInAsync(user, request.CurrentPassword, lockoutOnFailure: true);
        // A previously issued cookie can remain valid during password-attempt lockout.
        // Identity's pre-sign-in checks reject even the correct password in that state.
        if (verified.IsLockedOut)
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(((user.LockoutEnd ?? clock.GetUtcNow().AddMinutes(15)) - clock.GetUtcNow()).TotalSeconds));
            Response.Headers.RetryAfter = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
            return BadRequest(new { code = "password_change_locked", message = "비밀번호 확인 실패가 누적되어 계정이 잠겨 있습니다. 잠금이 해제된 후 다시 시도해 주세요.", retryAfterSeconds = seconds });
        }
        if (verified.IsNotAllowed)
            return BadRequest(new { code = "password_change_not_allowed", message = "현재 계정 상태에서는 비밀번호를 변경할 수 없습니다. 계정 상태를 확인해 주세요." });
        if (!verified.Succeeded)
            return BadRequest(new { code = "invalid_current_password", message = "현재 비밀번호가 일치하지 않습니다. 마지막으로 설정한 비밀번호를 확인해 주세요." });
        var ticket = await HttpContext.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        var wasRequired = user.MustChangePassword;
        user.MustChangePassword = false;
        var changed = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!changed.Succeeded) return BadRequest(new { message = "비밀번호를 변경하지 못했습니다. 새 비밀번호는 8~128자이며 영문 소문자, 숫자, 특수문자를 포함해야 합니다. 동시 변경 시 다시 로그인해 주세요." });
        var selected = await tenants.ResolveAsync(user.Id, token);
        audit.Add(selected, user.Id, "PasswordChanged", new { MustChangePassword = wasRequired }, new { MustChangePassword = false }, user.Id);
        await db.SaveChangesAsync(token);
        await transaction.CommitAsync(token);
        // Preserve persistence and original expiry while rotating the security stamp/current cookie.
        await tenants.IssueAsync(user, selected, ticket.Properties!);
        return Ok(new { message = "개인 비밀번호로 변경했습니다.", mustChangePassword = false });
    }

    [HttpPost("logout"), Authorize, AllowPendingPasswordChange]
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
