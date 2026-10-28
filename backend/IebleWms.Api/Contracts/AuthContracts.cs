using System.ComponentModel.DataAnnotations;

namespace IebleWms.Api.Contracts;

public sealed class RegisterCompanyRequest
{
    [Required, StringLength(200, MinimumLength = 1)] public string CompanyName { get; set; } = "";
    [Required, IebleWms.Api.Services.BusinessRegistrationNumberAttribute]
    public string BusinessRegistrationNumber { get; set; } = "";
    [Required, StringLength(200, MinimumLength = 1)] public string ContactName { get; set; } = "";
    [Required, RegularExpression(@"^\+?[0-9][0-9 -]{7,18}[0-9]$")]
    public string ContactPhone { get; set; } = "";
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = "";
    [Required, StringLength(128, MinimumLength = 12)] public string Password { get; set; } = "";
}

public sealed class LoginRequest
{
    public bool RememberMe { get; set; }
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = "";
    [Required, StringLength(128)] public string Password { get; set; } = "";
}

public sealed record SelectTenantRequest(Guid TenantId);
