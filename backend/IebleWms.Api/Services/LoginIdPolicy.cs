using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Services;

public sealed class LoginIdPolicy(WmsDbContext db, UserManager<ApplicationUser> users)
{
    public const string Pattern = @"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$";
    public const string DuplicateMessage = "이미 사용 중인 로그인 아이디입니다. 다른 아이디를 입력해 주세요.";
    public const string FormatMessage = "아이디는 영문·숫자로 시작하는 3~64자의 영문·숫자·마침표·밑줄·하이픈으로 입력해 주세요.";
    // Identity owns normalization. Inactive accounts and all tenant/account types reserve their names.
    public Task<bool> ExistsAsync(string value, CancellationToken token) =>
        db.Users.AsNoTracking().AnyAsync(x => x.NormalizedUserName == users.NormalizeName(value.Trim()), token);
    public async Task<object> CheckAsync(string value, CancellationToken token)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(value.Trim(), Pattern))
            throw new Organization.OrganizationException(400, FormatMessage);
        var exists = await ExistsAsync(value, token);
        return new { available = !exists, message = exists ? DuplicateMessage : "사용 가능한 로그인 아이디입니다." };
    }
}
