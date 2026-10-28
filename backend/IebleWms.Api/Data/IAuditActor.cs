namespace IebleWms.Api.Data;

// Runtime requests use HttpAuditActor; design-time and system operations use SystemAuditActor.
// Null denotes a system operation; never populate this from a client request body.
public interface IAuditActor
{
    Guid? UserId { get; }
}

internal sealed class SystemAuditActor : IAuditActor
{
    public Guid? UserId => null;
}
