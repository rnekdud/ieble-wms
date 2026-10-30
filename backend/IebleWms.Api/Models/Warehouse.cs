namespace IebleWms.Api.Models;

public interface IStorageItem
{
    Guid Id { get; set; }
    Guid TenantId { get; set; }
    string Code { get; set; }
    string Name { get; set; }
    bool IsActive { get; set; }
}
public sealed class Warehouse : AuditableEntity, IStorageItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public string? CustomCode { get; set; }
    public string? NormalizedCustomCode { get; set; }
    public Guid? CreationRequestId { get; set; }
    public string? TypeDescription { get; set; }
    public string? Type { get; set; }
    public string? Address { get; set; }
    public string? AddressDetail { get; set; }
    public string? ContactName { get; set; }
    public string? Notes { get; set; }
}
public sealed class WarehouseZone : AuditableEntity, IStorageItem
{
    [System.Text.Json.Serialization.JsonIgnore] public Guid? CreationRequestId { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public string? CreationRequestHash { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
public sealed class WarehouseRack : AuditableEntity, IStorageItem
{
    [System.Text.Json.Serialization.JsonIgnore] public Guid? CreationRequestId { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public string? CreationRequestHash { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid? ZoneId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int Levels { get; set; }
    public int Bays { get; set; }
}
// Physical identity is stable. Future inventory/barcode records reference this ID;
// visual plan coordinates belong to a separate future layout model.
public sealed class StorageLocation : AuditableEntity, IStorageItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    // Exactly one optional parent: rack OR direct zone. A rack's zone is derived from its rack.
    public Guid? ZoneId { get; set; }
    public Guid? RackId { get; set; }
    public int? Level { get; set; }
    public int? Bay { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
}
public sealed class WarehouseChange
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid TargetId { get; set; }
    public string Action { get; set; } = "";
    public Guid ChangedByUserId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string BeforeJson { get; set; } = "{}";
    public string AfterJson { get; set; } = "{}";
}
