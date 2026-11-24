namespace IebleWms.Api.Models;
// Tenant-owned label templates/custom paper definitions; images are persisted in DocumentJson.
public sealed class LabelDesign : AuditableEntity {
 public Guid TenantId {get;set;} public Guid Id {get;set;}=Guid.NewGuid();public string Name {get;set;}=""; public string Kind {get;set;}="template";public string DocumentJson {get;set;}="";public string PaperName {get;set;}="";public string? Thumbnail {get;set;}
 public bool IsActive {get;set;}=true;public Guid RequestId {get;set;} public string RequestHash {get;set;}="";
}
