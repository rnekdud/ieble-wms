using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
namespace IebleWms.Api.Billing;

public sealed record DevelopmentAccessPeriod(DateTimeOffset StartsAt,DateTimeOffset EndsAt);
public sealed class DevelopmentAccessService(WmsDbContext db,IHostEnvironment environment,TimeProvider clock,ILocalDevelopmentEnvironment local)
{
    // Never query or honor these rows outside Development, even if copied to Production.
    public async Task<DevelopmentAccessPeriod?> Active(Guid tenantId,CancellationToken ct=default)
    {
        if(!environment.IsDevelopment() || !local.IsLocal) return null;
        var row=await db.DevelopmentAccessGrants.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenantId,ct);
        var now=clock.GetUtcNow();
        return row!=null&&row.RevokedAt==null&&row.StartsAt<=now&&now<row.EndsAt ? new(row.StartsAt,row.EndsAt) : null;
    }
    public async Task<DevelopmentAccessGrant> Grant(Guid tenantId,string confirmedCode,DateTimeOffset start,DateTimeOffset end,string reason,string localOperator,CancellationToken ct=default)
    {
        RequireDevelopment();ValidateText(reason,localOperator);
        if(end<=start||end<=clock.GetUtcNow()) throw new OrganizationException(400,"시작·종료 일시를 확인해 주세요. 종료는 시작 이후의 미래 시각이어야 합니다.");
        await using var tx=await Lock(tenantId,ct);var tenant=await ConfirmTenant(tenantId,confirmedCode,ct);
        if(!tenant.IsActive||tenant.ServiceStatus!=TenantServiceStatus.Active) throw new OrganizationException(409,"비활성·이용 정지 기업에는 개발 테스트 접근을 부여할 수 없습니다.");
        var grant=await db.DevelopmentAccessGrants.SingleOrDefaultAsync(x=>x.TenantId==tenantId,ct);
        var before=JsonSerializer.Serialize(grant);
        if(grant==null){grant=new(){TenantId=tenantId};db.DevelopmentAccessGrants.Add(grant);}
        grant.StartsAt=start.ToUniversalTime();grant.EndsAt=end.ToUniversalTime();grant.GrantedAt=clock.GetUtcNow();grant.GrantedBy=localOperator;grant.Reason=reason.Trim();grant.RevokedAt=null;grant.Version=Guid.NewGuid();
        Audit(grant,"Granted",localOperator,reason,before);await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return grant;
    }
    public async Task Revoke(Guid tenantId,string confirmedCode,string reason,string localOperator,CancellationToken ct=default)
    {
        RequireDevelopment();ValidateText(reason,localOperator);await using var tx=await Lock(tenantId,ct);await ConfirmTenant(tenantId,confirmedCode,ct);
        var grant=await db.DevelopmentAccessGrants.SingleOrDefaultAsync(x=>x.TenantId==tenantId,ct)??throw new OrganizationException(404,"이 기업의 개발 테스트 권한이 없습니다.");
        if(grant.RevokedAt==null){var before=JsonSerializer.Serialize(grant);grant.RevokedAt=clock.GetUtcNow();grant.Version=Guid.NewGuid();Audit(grant,"Revoked",localOperator,reason,before);await db.SaveChangesAsync(ct);}
        await tx.CommitAsync(ct);
    }
    void RequireDevelopment(){if(!environment.IsDevelopment() || !local.IsLocal)throw new OrganizationException(403,"개발 테스트 접근은 로컬 Development 환경에서만 관리할 수 있습니다.");}
    static void ValidateText(string reason,string actor){if(string.IsNullOrWhiteSpace(reason)||reason.Trim().Length>1000||string.IsNullOrWhiteSpace(actor)||actor.Length>256||actor.Any(char.IsControl))throw new OrganizationException(400,"변경 사유와 로컬 실행자를 확인해 주세요.");}
    async Task<Tenant> ConfirmTenant(Guid id,string code,CancellationToken ct)
    {
        var tenant=await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id,ct)??throw new OrganizationException(404,"지정한 기업 ID가 없습니다.");
        if(!string.Equals(code,tenant.Code,StringComparison.Ordinal))throw new OrganizationException(400,"확인한 기업 코드가 기업 ID와 일치하지 않습니다.");
        return tenant;
    }
    async Task<IDbContextTransaction> Lock(Guid tenantId,CancellationToken ct)
    {
        var tx=await db.Database.BeginTransactionAsync(ct);
        try{if(db.Database.IsNpgsql())await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"development-access:"+tenantId},0))",ct);return tx;}catch{await tx.DisposeAsync();throw;}
    }
    void Audit(DevelopmentAccessGrant grant,string action,string actor,string reason,string before)=>db.DevelopmentAccessChanges.Add(new(){TenantId=grant.TenantId,Action=action,Operator=actor,Reason=reason.Trim(),ChangedAt=clock.GetUtcNow(),BeforeJson=before,AfterJson=JsonSerializer.Serialize(grant)});
}
