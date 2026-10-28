namespace IebleWms.Api.Data;

// Replace with a trusted authenticated-user implementation when authentication is added.
// Null denotes a system operation; never populate this from a client request body.
public interface IAuditActor
{
    Guid? UserId { get; }
}

internal sealed class SystemAuditActor : IAuditActor
{
    public Guid? UserId => null;
}
