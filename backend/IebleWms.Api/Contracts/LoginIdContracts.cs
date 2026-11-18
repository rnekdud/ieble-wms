using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace IebleWms.Api.Contracts;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class CheckLoginIdRequest
{
    [Required,StringLength(64)] public string LoginId {get;set;}="";
}
