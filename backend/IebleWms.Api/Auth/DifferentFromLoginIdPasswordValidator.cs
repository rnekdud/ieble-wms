using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace IebleWms.Api.Auth;

// Applies to personal passwords and ordinary Identity password operations.
// Only EmployeeService's explicit initial-password path skips complexity validation.
public sealed class DifferentFromLoginIdPasswordValidator : IPasswordValidator<ApplicationUser>
{
    public Task<IdentityResult> ValidateAsync(UserManager<ApplicationUser> manager, ApplicationUser user, string? password)
    {
        var matches = !string.IsNullOrEmpty(user.UserName) &&
            string.Equals(password, user.UserName, StringComparison.OrdinalIgnoreCase);
        return Task.FromResult(matches
            ? IdentityResult.Failed(new IdentityError { Code = "PasswordMatchesLoginId", Description = "로그인 아이디 및 초기 비밀번호와 다른 비밀번호를 입력해 주세요." })
            : IdentityResult.Success);
    }
}
