namespace IebleWms.Api.Organization;

public sealed partial class EmployeeService
{
    // Tenant membership contact data, deliberately separate from Identity phone authentication.
    private static string? NormalizeContactPhone(string? value)
    {
        if (value is null) return null;
        if (value.Length > 50 || value.Any(char.IsControl))
            throw new OrganizationException(400, "연락처는 제어문자 없이 50자 이내로 입력해 주세요.");
        var phone = value.Trim();
        if (phone.Length == 0) return null;
        if (!phone.Any(char.IsAsciiDigit) || phone.Where((c, index) =>
            !char.IsAsciiDigit(c) && c is not (' ' or '-' or '(' or ')') && !(c == '+' && index == 0)).Any())
            throw new OrganizationException(400, "연락처는 숫자·하이픈·공백·괄호와 맨 앞의 +만 사용할 수 있습니다.");
        return phone;
    }
}
