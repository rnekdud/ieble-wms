namespace IebleWms.Api.Models;

public sealed class BillingFeedback
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public Guid RequestId { get; set; }
    public string Message { get; set; } = "";
    public string Number { get; set; } = "";
    public string Category { get; set; } = "Billing";
    public string Title { get; set; } = "요금제 이용 소감";
    public string Status { get; set; } = "Received";
    public Guid? AssignedToId { get; set; }
    public string? Answer { get; set; }
    public Guid? AnsweredById { get; set; }
    public DateTimeOffset? AnsweredAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public string? RequestHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class BillingReminderDismissal
{
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
}
// Durable billing intent. No provider integration means no successful payment or entitlement is written.
public sealed class BillingInvoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public DateTimeOffset CycleStart { get; set; }
    public DateTimeOffset CycleEnd { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public int UserCount { get; set; }
    public long AmountKrw { get; set; }
    public string State { get; set; } = "ProviderNotConfigured";
    public string? ProviderPaymentId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class BillingChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? ActorId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string Action { get; set; } = "";
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
