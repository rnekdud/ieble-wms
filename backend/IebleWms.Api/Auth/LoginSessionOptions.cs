using System.ComponentModel.DataAnnotations;

namespace IebleWms.Api.Auth;

public sealed class LoginSessionOptions
{
    public const string SectionName = "Authentication:LoginSession";
    [Range(1, 365)] public int PersistentDays { get; set; } = 30;
    [Range(1, 168)] public int SessionHours { get; set; } = 8;
}
