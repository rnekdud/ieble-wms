namespace IebleWms.Api.Models;

// Bounded attachments share the inquiry transaction; no public file paths.
public sealed class SupportAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid FeedbackId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Content { get; set; } = [];
}
public sealed class SupportChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid FeedbackId { get; set; }
    public Guid ActorId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
