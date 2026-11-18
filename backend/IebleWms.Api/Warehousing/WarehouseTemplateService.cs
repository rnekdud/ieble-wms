using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Warehousing;
public sealed class WarehouseTemplateService(WmsDbContext db, OrganizationAudit audit)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static OrganizationException Missing()=>new(404,"현재 기업의 사용 가능한 템플릿을 찾을 수 없습니다.");
    static object View(WarehouseTemplate t)=>new{t.Id,t.Name,t.Description,t.RackCount,t.IsActive,t.Version,t.CreatedAt,t.UpdatedAt,document=JsonSerializer.Deserialize<TemplateDocument>(t.DocumentJson,Json)};
    public async Task<object> List(Guid tenant,string? search,int page,CancellationToken ct)
    {
        if(page<1||page>100000||search?.Length>100)throw new OrganizationException(400,"템플릿 검색 조건을 확인해 주세요.");
        var q=db.WarehouseTemplates.AsNoTracking().Where(x=>x.TenantId==tenant&&x.IsActive);
        if(!string.IsNullOrWhiteSpace(search)){var term=search.Trim().ToLower();q=q.Where(x=>x.Name.ToLower().Contains(term)||(x.Description!=null&&x.Description.ToLower().Contains(term)));}
        var total=await q.CountAsync(ct);page=Math.Min(page,Math.Max(1,(int)Math.Ceiling(total/20d)));
        return new{total,page,pageSize=20,items=await q.OrderByDescending(x=>x.UpdatedAt).ThenBy(x=>x.Id).Skip((page-1)*20).Take(20).Select(x=>new{x.Id,x.Name,x.Description,x.RackCount,x.Version,x.CreatedAt,x.UpdatedAt}).ToListAsync(ct)};
    }
    public async Task<object> Read(Guid tenant,Guid id,CancellationToken ct)=>View(await db.WarehouseTemplates.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id&&x.IsActive,ct)??throw Missing());
    public async Task<object> Save(Guid tenant,Guid actor,Guid? id,SaveWarehouseTemplateRequest r,CancellationToken ct)
    {
        if(r.RequestId==Guid.Empty||string.IsNullOrWhiteSpace(r.Name))throw new OrganizationException(400,"템플릿명과 요청 ID를 확인해 주세요.");
        var d=r.Document;
        var errors=new List<System.ComponentModel.DataAnnotations.ValidationResult>();
        bool Valid(object? value)=>value!=null&&System.ComponentModel.DataAnnotations.Validator.TryValidateObject(value,new(value),errors,true);
        if(!Valid(r)||!Valid(d)||d.Objects.Any(x=>!Valid(x))||d.Zones.Any(x=>!Valid(x))||d.Racks.Any(x=>!Valid(x)))throw new OrganizationException(400,"템플릿의 필수값과 객체 형식을 확인해 주세요.");
        bool Index(int? i,int length)=>!i.HasValue||(i>=0&&i<length);
        if(d.Racks.Any(x=>x.Levels*x.Bays>1000||!Index(x.ZoneIndex,d.Zones.Length))||d.Racks.Sum(x=>x.Levels*x.Bays)>10000||d.Zones.Select(x=>x.Code).Distinct().Count()!=d.Zones.Length||d.Racks.Select(x=>x.Code).Distinct().Count()!=d.Racks.Length||d.Objects.Any(o=>!Index(o.RackIndex,d.Racks.Length)||!Index(o.ZoneIndex,d.Zones.Length)||(o.RackIndex!=null&&o.Type!="rack")||(o.ZoneIndex!=null&&o.Type!="zone"))||d.Objects.Where(x=>x.RackIndex!=null).Select(x=>x.RackIndex).Distinct().Count()!=d.Objects.Count(x=>x.RackIndex!=null))
            throw new OrganizationException(400,"템플릿의 구역·랙 연결, 코드 또는 단수·칸수를 확인해 주세요. 위치는 최대 10,000개입니다.");
        var json=JsonSerializer.Serialize(d,Json);var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{r.Name,r.Description,r.Document},Json))));
        await using var tx=await WarehouseWriteScope.Begin(db,tenant,ct);
        var existing=await db.WarehouseTemplates.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.RequestId==r.RequestId,ct);
        if(!id.HasValue&&existing!=null){if(existing.RequestHash!=hash||id.HasValue&&existing.Id!=id)throw new OrganizationException(409,"같은 요청의 템플릿 내용이 달라졌습니다.");return View(existing);}
        var row=id.HasValue?await db.WarehouseTemplates.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id&&x.IsActive,ct)??throw Missing():new WarehouseTemplate{TenantId=tenant};
        if(id.HasValue&&row.Version!=r.Version)throw new OrganizationException(409,"템플릿이 변경되었습니다. 최신 내용을 다시 확인해 주세요.");
        var before=id.HasValue?View(row):null;
        row.Name=r.Name.Trim();row.Description=r.Description?.Trim();row.DocumentJson=json;row.RackCount=d.Racks.Length;if(!id.HasValue){row.RequestId=r.RequestId;row.RequestHash=hash;}
        if(!id.HasValue)db.WarehouseTemplates.Add(row);
        audit.Add(tenant,actor,id.HasValue?"WarehouseTemplateUpdated":"WarehouseTemplateCreated",before!,new{row.Id,row.Name,row.Description,document=d});
        try{await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"다른 사용자가 템플릿을 변경했습니다.");}
        return View(row);
    }
    public async Task<object> Archive(Guid tenant,Guid actor,Guid id,Guid version,CancellationToken ct)
    {
        await using var tx=await WarehouseWriteScope.Begin(db,tenant,ct);
        var row=await db.WarehouseTemplates.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.Id==id&&x.IsActive,ct)??throw Missing();
        if(row.Version!=version)throw new OrganizationException(409,"템플릿이 변경되었습니다. 다시 조회해 주세요.");
        row.IsActive=false;audit.Add(tenant,actor,"WarehouseTemplateArchived",new{row.Id,isActive=true},new{row.Id,isActive=false});
        try{await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"다른 사용자가 템플릿을 변경했습니다.");}return new{row.Id,row.IsActive};
    }
}
