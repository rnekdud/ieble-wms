using System.ComponentModel.DataAnnotations;

namespace IebleWms.Api.Services;

public static class BusinessRegistrationNumber
{
    public static string Normalize(string value) => new(value.Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray());
    public static bool IsValid(string value) => value.Length == 10 && value.All(c => c is >= '0' and <= '9');
}

public sealed class BusinessRegistrationNumberAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) => value is string text && text.Length <= 64 && BusinessRegistrationNumber.IsValid(BusinessRegistrationNumber.Normalize(text));
}
