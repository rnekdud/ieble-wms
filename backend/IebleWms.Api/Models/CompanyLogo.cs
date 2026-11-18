using System.Text.Json.Serialization;
namespace IebleWms.Api.Models;
public sealed class CompanyLogo
{
    public Guid TenantId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    [JsonIgnore] public byte[] Content { get; set; } = [];
}
