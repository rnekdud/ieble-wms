namespace IebleWms.Api.Models;

// Committed with the aggregate so retries can never observe a partly saved workspace.
public sealed class WarehouseSaveReceipt
{
    public Guid TenantId { get; set; }
    public Guid RequestId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid ActorId { get; set; }
    public string RequestHash { get; set; } = "";
    public string ResponseJson { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
