namespace IebleWms.Api.Models;

// Receipt-level attachments. Bytes use the same authenticated DB storage as product images.
public sealed class ReceiptPhoto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid ReceiptId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public byte[] Thumbnail { get; set; } = [];
    public int Position { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
