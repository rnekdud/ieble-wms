using System.Security.Claims;
using IebleWms.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Auth;

[AttributeUsage(AttributeTargets.Method)]
public sealed class AllowPendingPasswordChangeAttribute : Attribute;

// All MVC API actions are blocked while a temporary credential is in use, except the explicit recovery allow-list.
public sealed class PasswordChangeGate(WmsDbContext db) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        if (context.HttpContext.User.Identity?.IsAuthenticated != true ||
            context.ActionDescriptor.EndpointMetadata.OfType<AllowPendingPasswordChangeAttribute>().Any()) return;
        if (Guid.TryParse(context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) &&
            await db.Users.AsNoTracking().AnyAsync(x => x.Id == id && x.MustChangePassword, context.HttpContext.RequestAborted))
            context.Result = new ObjectResult(new { code = "password_change_required", message = "업무를 시작하기 전에 개인 비밀번호로 변경해 주세요." }) { StatusCode = 403 };
    }
}
