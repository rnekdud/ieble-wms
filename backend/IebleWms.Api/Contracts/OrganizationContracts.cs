using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using IebleWms.Api.Services;

namespace IebleWms.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateCompanyRequest
{
    public CompanyLogoRequest? Logo { get; set; }
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
    public Guid? PermissionGradeId { get; set; }
    public bool IsActive { get; set; } = true;
    [Required, RegularExpression("^(Internal|External)$")] public string AccountType { get; set; } = "Internal";
    public Guid? CollaboratorId { get; set; }
    public Guid? PartnerId { get; set; }
    [StringLength(200)] public string? CompanyName { get; set; }
    [StringLength(64)] public string? BusinessRegistrationNumber { get; set; }
    [StringLength(50)] public string? CompanyPhone { get; set; }
    [StringLength(50)] public string? ContactPhone { get; set; }
    [EmailAddress, StringLength(256)] public string? ContactEmail { get; set; }

    public Guid? DepartmentId { get; set; }
    public Guid? PositionId { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, RegularExpression(IebleWms.Api.Services.LoginIdPolicy.Pattern, ErrorMessage = IebleWms.Api.Services.LoginIdPolicy.FormatMessage)] public string LoginId { get => loginId; set => loginId = value?.Trim() ?? ""; }
    private string loginId = "";
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = "";
    [Required, RegularExpression("^(Administrator|Employee)$")] public string Role { get; set; } = "Employee";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateEmployeeRequest
{
    private Guid? permissionGradeId;
    public Guid? PermissionGradeId { get => permissionGradeId; set { permissionGradeId = value; PermissionGradeIdSpecified = true; } }
    [JsonIgnore] public bool PermissionGradeIdSpecified { get; private set; }
    [RegularExpression("^(Internal|External)$")] public string? AccountType { get; set; }
    public Guid? CollaboratorId { get; set; }
    public Guid? PartnerId { get; set; }
    [StringLength(200)] public string? CompanyName { get; set; }
    [StringLength(64)] public string? BusinessRegistrationNumber { get; set; }
    [StringLength(50)] public string? CompanyPhone { get; set; }
    private string? contactPhone;
    [StringLength(50)] public string? ContactPhone { get => contactPhone; set { contactPhone = value; ContactPhoneSpecified = true; } }
    [JsonIgnore] public bool ContactPhoneSpecified { get; private set; }
    [EmailAddress, StringLength(256)] public string? ContactEmail { get; set; }

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
public sealed record MemberOrganizationRequest(Guid Version, Guid? DepartmentId, Guid? PositionId)
{
    private string? email;
    [EmailAddress, StringLength(256)] public string? Email { get => email; set { email = value; EmailSpecified = true; } }
    [JsonIgnore] public bool EmailSpecified { get; private set; }

    private string? contactPhone;
    [StringLength(50)] public string? ContactPhone { get => contactPhone; set { contactPhone = value; ContactPhoneSpecified = true; } }
    [JsonIgnore] public bool ContactPhoneSpecified { get; private set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class TransferMasterRequest
{
    public Guid TargetUserId { get; set; }
    public Guid CurrentMasterVersion { get; set; }
    public Guid TargetVersion { get; set; }
    [Required, StringLength(128)] public string CurrentPassword { get; set; } = "";
    [Required, StringLength(500)] public string Reason { get; set; } = "";
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PermissionGradeRequest
{
    [Required, StringLength(100)] public string Name { get; set; } = "";
    [StringLength(500)] public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid Version { get; set; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class CompanyLogoRequest
{
    public bool Remove { get; set; }
    [StringLength(160)] public string? FileName { get; set; }
    [StringLength(40)] public string? ContentType { get; set; }
    [StringLength(2796204)] public string? Base64 { get; set; }
}
