using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using IebleWms.Api.Services;

namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateCompanyRequest
{
    public Guid Version { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [StringLength(200)] public string? RepresentativeName { get; set; }
    [StringLength(500)] public string? Address { get; set; }
    [StringLength(200)] public string? ContactName { get; set; }
    [StringLength(30), RegularExpression(@"^\+?[0-9][0-9 ()-]{5,28}[0-9]$")] public string? ContactPhone { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateBusinessNumberRequest
{
    public Guid Version { get; set; }
    [Required, BusinessRegistrationNumberAttribute] public string BusinessRegistrationNumber { get; set; } = "";
    [Required, StringLength(500)] public string Reason { get; set; } = "";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class CreateEmployeeRequest
{
    public Guid? DepartmentId { get; set; }
    public Guid? PositionId { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, RegularExpression(@"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$")] public string LoginId { get; set; } = "";
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = "";
    [Required, RegularExpression("^(Administrator|Employee)$")] public string Role { get; set; } = "Employee";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateEmployeeRequest
{
    public Guid? DepartmentId { get; set; }
    public Guid? PositionId { get; set; }
    public Guid Version { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, RegularExpression("^(Administrator|Employee)$")] public string Role { get; set; } = "Employee";
    public bool IsActive { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ResetEmployeePasswordRequest(Guid Version);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ChangePasswordRequest
{
    [Required, StringLength(128)] public string CurrentPassword { get; set; } = "";
    [Required, StringLength(128), MinLength(8, ErrorMessage = "비밀번호는 최소 8자 이상 입력해 주세요.")] public string NewPassword { get; set; } = "";
    [Required, Compare(nameof(NewPassword))] public string ConfirmPassword { get; set; } = "";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class OrganizationItemRequest
{
    [Required, StringLength(100)] public string Name { get; set; } = "";
    public Guid? ParentId { get; set; }
    [Range(0, 100000)] public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid Version { get; set; }
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OrganizationItemDeleteRequest(Guid Version);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MemberOrganizationRequest(Guid Version, Guid? DepartmentId, Guid? PositionId);
