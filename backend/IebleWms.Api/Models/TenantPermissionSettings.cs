namespace IebleWms.Api.Models;

public sealed class TenantPermissionSettings
{
    public Guid TenantId { get; set; }
    public string RolesJson { get; set; } = "";
    public Guid Version { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid UpdatedByUserId { get; set; }
}

public sealed class TenantPermissionChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string BeforeJson { get; set; } = "";
    public string AfterJson { get; set; } = "";
    public Guid Version { get; set; }
}
