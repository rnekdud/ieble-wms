namespace IebleWms.Api.Contracts;
public sealed class ProductDeleteRequest
{
    [System.ComponentModel.DataAnnotations.Required, System.ComponentModel.DataAnnotations.MinLength(1), System.ComponentModel.DataAnnotations.MaxLength(100)]
    public ProductDeleteTarget[] Items { get; set; } = [];
}
public sealed record ProductDeleteTarget(Guid Id, Guid Version);
