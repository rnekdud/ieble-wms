namespace IebleWms.Api.Models;

// Persisted independently of business records: deleting a document never releases its number.
public sealed class BusinessCodeCounter
{
    public Guid TenantId { get; set; }
    public string Prefix { get; set; } = "";
    public long LastValue { get; set; }
}
