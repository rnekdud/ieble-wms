using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;

public sealed class Partner : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    [JsonIgnore] public string NormalizedCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string Type { get; set; } = "SUPPLIER";
    // Explicit scope avoids imposing the Korean 10-digit rule on foreign identifiers.
    public string RegistrationCountry { get; set; } = "KR";
    [JsonIgnore] public string? NormalizedBusinessNumber { get; set; }
    public string? BusinessRegistrationNumber { get; set; }
    public string? RepresentativeName { get; set; }
    public string? PostalCode { get; set; }
    public string? Address { get; set; }
    public string? AddressDetail { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? PaymentTerms { get; set; }
    public string? DefaultShippingPostalCode { get; set; }
    public string? DefaultShippingAddress { get; set; }
    public string? DefaultShippingAddressDetail { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    [JsonIgnore] public Guid CreationRequestId { get; set; }
    [JsonIgnore] public string CreationHash { get; set; } = "";
}
public sealed class PartnerChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid TargetId { get; set; }
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
