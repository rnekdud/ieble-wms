using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Warehousing;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Labels;
public sealed class LabelDesignService(WmsDbContext db,OrganizationAudit audit) {
 static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
 static OrganizationException Missing()=>new(404,"현재 기업의 라벨 템플릿을 찾을 수 없습니다.");
 static object View(LabelDesign r)=>new{r.Id,r.Name,r.Kind,r.PaperName,r.Thumbnail,r.Version,r.UpdatedAt,document=JsonSerializer.Deserialize<LabelDesignDocument>(r.DocumentJson,Json)};
 public async Task<object> List(Guid tenant,string kind,int page,string? search,CancellationToken ct){
  if(kind is not("template" or "paper")||page<1||page>10000||search?.Length>100)throw new OrganizationException(400,"검색 조건을 확인해 주세요.");
  var q=db.LabelDesigns.AsNoTracking().Where(r=>r.TenantId==tenant&&r.Kind==kind&&r.IsActive);if(!string.IsNullOrWhiteSpace(search)){var term=search.Trim().ToLower();q=q.Where(r=>r.Name.ToLower().Contains(term));}
  var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/20d)));
  return new{total,page,pageSize=20,items=await q.OrderByDescending(r=>r.UpdatedAt).ThenBy(r=>r.Id).Skip((page-1)*20).Take(20).Select(r=>new{r.Id,r.Name,r.Kind,r.PaperName,r.Thumbnail,r.Version,r.UpdatedAt}).ToListAsync(ct)};
 }
 public async Task<object> Read(Guid tenant,Guid id,CancellationToken ct)=>View(await db.LabelDesigns.AsNoTracking().SingleOrDefaultAsync(r=>r.TenantId==tenant&&r.Id==id&&r.IsActive,ct)??throw Missing());
 public async Task<object> Save(Guid tenant,Guid actor,Guid? id,SaveLabelDesign r,CancellationToken ct){
  if(string.IsNullOrWhiteSpace(r.Name)||r.Name.Length>100||r.RequestId==Guid.Empty)throw new OrganizationException(400,"템플릿명과 요청 ID를 확인해 주세요.");LabelValidation.Document(r.Document,r.Kind);if(r.Thumbnail!=null)LabelValidation.Image(r.Thumbnail,200000,true);
  var products=r.Document.Labels.SelectMany(l=>l.Objects).Where(o=>o.Binding!=null).Select(o=>o.Binding!.ProductId).Distinct().ToArray();
  if(await db.Products.CountAsync(p=>p.TenantId==tenant&&products.Contains(p.Id),ct)!=products.Length)throw new OrganizationException(400,"현재 기업에서 확인할 수 없는 상품 연결입니다.");
  var json=JsonSerializer.Serialize(r.Document,Json);if(json.Length>15*1024*1024)throw new OrganizationException(400,"템플릿 용량을 줄여 주세요.");
  var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{r.Name,r.Kind,r.Document,r.Thumbnail},Json))));
  await using var tx=await WarehouseWriteScope.Begin(db,tenant,ct);
  if(!id.HasValue){var duplicate=await db.LabelDesigns.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);if(duplicate!=null){if(duplicate.RequestHash!=hash||!duplicate.IsActive)throw new OrganizationException(409,"동일 요청의 저장 내용이 달라졌습니다.");return View(duplicate);}}
  var row=id.HasValue?await db.LabelDesigns.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id&&x.IsActive,ct)??throw Missing():new LabelDesign{TenantId=tenant,RequestId=r.RequestId,RequestHash=hash};
  if(id.HasValue&&(row.Version!=r.Version||row.Kind!=r.Kind))throw new OrganizationException(409,"템플릿이 변경되었습니다. 다시 불러와 주세요.");
  row.Name=r.Name.Trim();row.Kind=r.Kind;row.PaperName=r.Document.Paper.Name;row.DocumentJson=json;row.Thumbnail=r.Thumbnail;if(!id.HasValue)db.LabelDesigns.Add(row);
  audit.Add(tenant,actor,id.HasValue?"LabelDesignUpdated":"LabelDesignCreated",new{id},new{row.Id,row.Name,row.Kind});
  try{await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"다른 사용자가 템플릿을 수정했습니다.");}return View(row);
 }
 public async Task<object> Archive(Guid tenant,Guid actor,Guid id,Guid version,CancellationToken ct){
  var row=await db.LabelDesigns.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id&&x.IsActive,ct)??throw Missing();if(row.Version!=version)throw new OrganizationException(409,"템플릿이 변경되었습니다. 다시 불러와 주세요.");row.IsActive=false;audit.Add(tenant,actor,"LabelDesignArchived",new{row.Id,isActive=true},new{row.Id,isActive=false});
  try{await db.SaveChangesAsync(ct);}catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"다른 사용자가 템플릿을 수정했습니다.");}return new{row.Id,row.IsActive};
 }
}
