using IebleWms.Api.Billing;
using IebleWms.Api.Models;

namespace IebleWms.Api.Organization;

public sealed record EmployeeView(Guid UserId, string Name, string LoginId, string Email, string Role, bool IsActive,
    bool MembershipIsActive, bool AccountIsActive, DateTimeOffset RegisteredAt, DateTimeOffset? LastLoginAt,
    DateTimeOffset BillingStartsAt, string BillingStartMonth, DateTimeOffset? BillingEndsAt, DateTimeOffset? DeactivatedAt,
    bool MustChangePassword, Guid Version, Guid? DepartmentId, Guid? PositionId, string? DepartmentName, string? PositionName)
{
    public static EmployeeView From(TenantMembership membership, BillingAccessService billing, string? departmentName = null, string? positionName = null)
    {
        var starts = membership.BillingStartsAt ?? billing.FirstMemberChargeAt(membership);
        return new(membership.UserId, membership.DisplayName ?? membership.User.DisplayName, membership.User.UserName!, membership.User.Email!,
            membership.Role.ToString(), membership.IsActive && membership.User.IsActive, membership.IsActive, membership.User.IsActive,
            membership.CreatedAt, null, starts, TimeZoneInfo.ConvertTime(starts, TimeZoneInfo.FindSystemTimeZoneById(billing.Policy.TimeZoneId)).ToString("yyyy-MM"),
            membership.BillingEndsAt, membership.DeactivatedAt, membership.User.MustChangePassword, membership.Version, membership.DepartmentId, membership.PositionId, departmentName, positionName);
    }
}
