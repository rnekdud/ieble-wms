using System.Security.Cryptography;
using System.Text.Json;
using System.ComponentModel.DataAnnotations;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Permissions;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Support;

public sealed class SupportQuery
{
    [StringLength(100)] public string? Search { get; set; }
    [StringLength(100)] public string? Company { get; set; }
    public string? Category { get; set; }
    public string? Status { get; set; }
    public Guid? TenantId { get; set; }
    public DateOnly? Start { get; set; }
    public DateOnly? End { get; set; }
    [Range(1,100000)] public int Page { get; set; } = 1;
    [Range(1,100)] public int PageSize { get; set; } = 20;
}
public sealed class SupportCreate
{
    public Guid RequestId { get; set; }
    [Required] public string Category { get; set; } = "Service";
    [Required,StringLength(200)] public string Title { get; set; } = "";
    [Required,StringLength(10000)] public string Message { get; set; } = "";
    public List<IFormFile> Files { get; set; } = [];
}
public sealed class SupportUpdate
{
    public Guid Version { get; set; }
    [Required] public string Status { get; set; } = "Received";
    public Guid? AssignedToId { get; set; }
    [StringLength(10000)] public string? Answer { get; set; }
}
public sealed class SupportService(WmsDbContext db,TenantPermissionService permissions,TimeProvider clock)
{
    public static readonly string[] Categories = ["Service","Feature","Bug","Billing","Suggestion","Other"];
    public static readonly string[] Statuses = ["Received","InProgress","Answered","Closed"];
    public static string Number(BillingFeedback f) => f.Number.Length>0?f.Number:"FB-"+f.Id.ToString("N");
    async Task<IQueryable<BillingFeedback>> Scope(Guid? tenant,Guid actor,CancellationToken ct)
    {
        var query=db.BillingFeedbacks.AsNoTracking();
        if(tenant.HasValue) {
            if(!await permissions.AllowsAsync(actor,tenant.Value,"support","read",ct))throw new OrganizationException(403,"문의 조회 권한이 없습니다.");
            query=query.Where(x=>x.TenantId==tenant);
            if(!await permissions.AllowsAsync(actor,tenant.Value,"support","readAll",ct))query=query.Where(x=>x.UserId==actor);
        } else if(!await db.Users.AnyAsync(x=>x.Id==actor && x.IsActive && x.SystemRole==SystemRole.IebleAdministrator,ct))throw new OrganizationException(403,"아이블 관리자 전용 기능입니다.");
        return query;
    }
    public static DateTimeOffset Boundary(DateOnly day) => new(day.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(9));
    public static bool ValidPeriod(DateOnly? start, DateOnly? end) =>
        !(start > end) && start != DateOnly.MinValue && end != DateOnly.MaxValue;
    public async Task<object> List(Guid? tenant,Guid actor,SupportQuery q,CancellationToken ct)
    {
        var query=await Scope(tenant,actor,ct);
        if(q.Category!=null){if(!Categories.Contains(q.Category))throw new OrganizationException(400,"문의 유형을 확인해 주세요.");query=query.Where(x=>x.Category==q.Category);}
        if(q.Status!=null){if(!Statuses.Contains(q.Status))throw new OrganizationException(400,"문의 상태를 확인해 주세요.");query=query.Where(x=>x.Status==q.Status);}
        if(!ValidPeriod(q.Start,q.End))throw new OrganizationException(400,"조회 기간을 확인해 주세요.");
        if(q.Start.HasValue){var start=Boundary(q.Start.Value).ToUniversalTime();query=query.Where(x=>x.CreatedAt>=start);}
        if(q.End.HasValue){var end=Boundary(q.End.Value.AddDays(1)).ToUniversalTime();query=query.Where(x=>x.CreatedAt<end);}
        if(!tenant.HasValue && q.TenantId.HasValue)query=query.Where(x=>x.TenantId==q.TenantId);
        if(!string.IsNullOrWhiteSpace(q.Search)){var term=q.Search.Trim().ToLowerInvariant();query=query.Where(x=>x.Title.ToLower().Contains(term)||x.Number.ToLower().Contains(term)||("fb-"+x.Id.ToString().Replace("-","")).Contains(term));}
        if(!string.IsNullOrWhiteSpace(q.Company)){var term=q.Company.Trim().ToLowerInvariant();query=query.Where(x=>db.Tenants.Any(t=>t.Id==x.TenantId&&t.Name.ToLower().Contains(term)));}
        var total=await query.CountAsync(ct);var page=Math.Min(q.Page,Math.Max(1,(total+q.PageSize-1)/q.PageSize));
        var items=await (from f in query join t in db.Tenants on f.TenantId equals t.Id join u in db.Users on f.UserId equals u.Id
            join a in db.Users on f.AssignedToId equals a.Id into admins from a in admins.DefaultIfEmpty()
            orderby f.CreatedAt descending,f.Id descending
            select new {f.Id,f.TenantId,f.Number,f.Title,f.Category,f.Status,f.CreatedAt,f.AnsweredAt,company=t.Name,author=u.DisplayName,assignee=a==null?null:a.DisplayName})
            .Skip((page-1)*q.PageSize).Take(q.PageSize).ToListAsync(ct);
        return new{items=items.Select(x=>new{x.Id,x.TenantId,number=x.Number.Length>0?x.Number:"FB-"+x.Id.ToString("N"),x.Title,x.Category,x.Status,x.CreatedAt,x.AnsweredAt,x.company,x.author,x.assignee}),total,page,pageSize=q.PageSize};
    }
    public async Task<object> Detail(Guid? tenant,Guid actor,Guid id,CancellationToken ct)
    {
        var f=await (await Scope(tenant,actor,ct)).SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new OrganizationException(404,"문의를 찾을 수 없습니다.");
        var author=await db.Users.Where(x=>x.Id==f.UserId).Select(x=>x.DisplayName).SingleAsync(ct);
        var company=await db.Tenants.Where(x=>x.Id==f.TenantId).Select(x=>x.Name).SingleAsync(ct);
        var names=await db.Users.Where(x=>x.Id==f.AssignedToId||x.Id==f.AnsweredById).ToDictionaryAsync(x=>x.Id,x=>x.DisplayName,ct);
        var attachments=await db.SupportAttachments.Where(x=>x.TenantId==f.TenantId&&x.FeedbackId==f.Id).Select(x=>new{x.Id,x.FileName,x.ContentType,size=x.Content.Length}).ToListAsync(ct);
        var history=await (from h in db.SupportChanges.AsNoTracking() join u in db.Users on h.ActorId equals u.Id where h.TenantId==f.TenantId&&h.FeedbackId==f.Id orderby h.Id descending select new{h.Id,h.ChangedAt,actor=u.DisplayName,h.BeforeJson,h.AfterJson}).Take(100).ToListAsync(ct);
        return new{f.Id,f.TenantId,number=Number(f),f.Title,f.Category,f.Status,f.Message,f.CreatedAt,f.Version,f.Answer,f.AnsweredAt,f.AssignedToId,f.UpdatedAt,author,company,
            assignee=f.AssignedToId.HasValue?names.GetValueOrDefault(f.AssignedToId.Value):null,answerer=f.AnsweredById.HasValue?names.GetValueOrDefault(f.AnsweredById.Value):null,attachments,history};
    }
    public async Task<SupportAttachment> Download(Guid? tenant,Guid actor,Guid id,Guid fileId,CancellationToken ct)
    {
        if(!await (await Scope(tenant,actor,ct)).AnyAsync(x=>x.Id==id,ct))throw new OrganizationException(404,"첨부파일을 찾을 수 없습니다.");
        return await db.SupportAttachments.AsNoTracking().SingleOrDefaultAsync(x=>x.FeedbackId==id&&x.Id==fileId,ct)??throw new OrganizationException(404,"첨부파일을 찾을 수 없습니다.");
    }
    object Snapshot(BillingFeedback f)=>new{f.Status,f.AssignedToId,f.Answer,f.AnsweredById,f.AnsweredAt};
    void Audit(BillingFeedback f,Guid actor,object before)=>db.SupportChanges.Add(new(){TenantId=f.TenantId,FeedbackId=f.Id,ActorId=actor,ChangedAt=clock.GetUtcNow(),BeforeJson=JsonSerializer.Serialize(before),AfterJson=JsonSerializer.Serialize(Snapshot(f))});
    public async Task<object> Create(Guid tenant,Guid actor,SupportCreate r,CancellationToken ct)
    {
        if(!await permissions.AllowsAsync(actor,tenant,"support","create",ct))throw new OrganizationException(403,"문의 등록 권한이 없습니다.");
        var title=r.Title.Trim();var message=r.Message.Trim();
        if(r.RequestId==Guid.Empty||!Categories.Contains(r.Category)||title.Length is 0 or >200||message.Length is 0 or >10000)throw new OrganizationException(400,"문의 유형·제목·내용을 확인해 주세요.");
        var files=await SupportFiles.Read(r.Files,ct);
        var hash=Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new{title,message,r.Category,files=files.Select(x=>new{x.FileName,hash=Convert.ToHexString(SHA256.HashData(x.Content))})})));
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        if(db.Database.IsNpgsql())await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"support:"+tenant+":"+actor+":"+r.RequestId},0))",ct);
        var prior=await db.BillingFeedbacks.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.UserId==actor&&x.RequestId==r.RequestId,ct);
        if(prior!=null){if(prior.RequestHash!=hash)throw new OrganizationException(409,"같은 요청으로 다른 내용을 등록할 수 없습니다. 문의 목록을 확인해 주세요.");return new{id=prior.Id,number=Number(prior)};}
        var f=new BillingFeedback{TenantId=tenant,UserId=actor,RequestId=r.RequestId,Title=title,Message=message,Category=r.Category,RequestHash=hash,CreatedAt=clock.GetUtcNow()};
        f.Number=await IebleWms.Api.Services.BusinessCodes.Next(db,tenant,"QA",ct);db.Add(f);
        foreach(var file in files){file.TenantId=tenant;file.FeedbackId=f.Id;db.Add(file);}Audit(f,actor,new{});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return new{id=f.Id,number=f.Number};
    }
    public async Task<object> Update(Guid actor,Guid id,SupportUpdate r,CancellationToken ct)
    {
        await Scope(null,actor,ct);
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        var f=await db.BillingFeedbacks.SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new OrganizationException(404,"문의를 찾을 수 없습니다.");
        if(f.Version!=r.Version)throw new OrganizationException(409,"다른 관리자가 변경했습니다. 상세를 다시 열어 확인해 주세요.");
        if(f.Status=="Closed")throw new OrganizationException(409,"종료된 문의는 수정할 수 없습니다. 추가 문의를 등록해 주세요.");
        var answer=string.IsNullOrWhiteSpace(r.Answer)?null:r.Answer.Trim();
        var allowed=f.Status switch {"Received"=>new[]{"Received","InProgress","Answered"},"InProgress"=>new[]{"InProgress","Answered"},_=>new[]{"Answered","Closed"}};
        if(!allowed.Contains(r.Status)||answer?.Length>10000||(r.Status is "Answered" or "Closed" && answer==null)||(r.Status is "Received" or "InProgress"&&answer!=null))throw new OrganizationException(400,"답변을 입력한 뒤 답변 완료로 저장해 주세요. 답변 완료 후 종료할 수 있습니다.");
        if(r.AssignedToId.HasValue&&!await db.Users.AnyAsync(x=>x.Id==r.AssignedToId&&x.IsActive&&x.SystemRole==SystemRole.IebleAdministrator,ct))throw new OrganizationException(400,"활성 아이블 관리자만 담당자로 지정할 수 있습니다.");
        var before=Snapshot(f);if(answer!=f.Answer){f.Answer=answer;f.AnsweredAt=clock.GetUtcNow();f.AnsweredById=actor;}
        f.Status=r.Status;f.AssignedToId=r.AssignedToId;f.UpdatedAt=clock.GetUtcNow();f.Version=Guid.NewGuid();Audit(f,actor,before);
        try{await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);}catch(DbUpdateConcurrencyException){throw new OrganizationException(409,"다른 관리자가 변경했습니다. 상세를 다시 열어 확인해 주세요.");}
        return new{f.Id,f.Version};
    }
}
