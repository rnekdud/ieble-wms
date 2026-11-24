using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PartnerRequest
{
    // Omitted fields preserve older clients and idempotency hashes; empty strings clear the address.
    [StringLength(500), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DefaultShippingAddress { get; set; }
    [StringLength(500), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DefaultShippingAddressDetail { get; set; }
    [StringLength(20), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DefaultShippingPostalCode { get; set; }
    public Guid RequestId { get; set; }
    public Guid Version { get; set; }
    [StringLength(64)] public string? Code { get; set; }
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, RegularExpression("^(SUPPLIER|CUSTOMER|BOTH)$")] public string Type { get; set; } = "SUPPLIER";
    [Required, RegularExpression("^(KR|OTHER)$")] public string RegistrationCountry { get; set; } = "KR";
    [StringLength(64)] public string? BusinessRegistrationNumber { get; set; }
    [StringLength(100)] public string? RepresentativeName { get; set; }
    [StringLength(20)] public string? PostalCode { get; set; }
    [StringLength(500)] public string? Address { get; set; }
    [StringLength(500)] public string? AddressDetail { get; set; }
    [StringLength(50)] public string? Phone { get; set; }
    [StringLength(254)] public string? Email { get; set; }
    [StringLength(100)] public string? ContactName { get; set; }
    [StringLength(50)] public string? ContactPhone { get; set; }
    [StringLength(500)] public string? PaymentTerms { get; set; }
    [StringLength(2000)] public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PartnerStatusRequest
{
    public Guid Version { get; set; }
    public bool IsActive { get; set; }
}
