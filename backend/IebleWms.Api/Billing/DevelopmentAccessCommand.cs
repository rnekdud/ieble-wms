using System.Globalization;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Billing;

// Local CLI only: no HTTP endpoint and no role that can grant itself test access.
public static class DevelopmentAccessCommand
{
    public static async Task<int> RunAsync(IServiceProvider services,string[] args)
    {
        using var scope=services.CreateScope();var sp=scope.ServiceProvider;
        if(!sp.GetRequiredService<IHostEnvironment>().IsDevelopment()){Console.Error.WriteLine("Development 환경에서만 실행할 수 있습니다.");return 1;}
        try
        {
            var db=sp.GetRequiredService<WmsDbContext>();
            if((await db.Database.GetPendingMigrationsAsync()).Any())throw new OrganizationException(409,"검토한 마이그레이션을 먼저 적용해 주세요.");
            if(args.Length==1&&args[0]=="list")
            {
                var tenants=await db.Tenants.AsNoTracking().OrderBy(x=>x.Code).Select(x=>new{x.Id,x.Code,x.Name,x.IsActive,x.ServiceStatus,x.BillingStatus}).ToListAsync();
                var grants=await db.DevelopmentAccessGrants.AsNoTracking().ToListAsync();
                Write(new{environment="Development",tenants,grants});return 0;
            }
            if(args.Length<1||args[0] is not ("grant" or "revoke"))throw new OrganizationException(400,"명령: --development-access list | grant | revoke");
            var values=new Dictionary<string,string>();
            for(var i=1;i<args.Length;i+=2){if(i+1>=args.Length||!args[i].StartsWith("--")||!values.TryAdd(args[i],args[i+1]))throw new OrganizationException(400,"명령 인자를 확인해 주세요.");}
            var allowed=args[0]=="grant"?new[]{"--tenant","--confirm-code","--reason","--start","--end","--days"}:new[]{"--tenant","--confirm-code","--reason"};
            if(values.Keys.Except(allowed).Any()||!values.TryGetValue("--tenant",out var rawId)||!Guid.TryParseExact(rawId,"D",out var id)||id==Guid.Empty||!values.TryGetValue("--confirm-code",out var code)||!values.TryGetValue("--reason",out var reason))throw new OrganizationException(400,"--tenant 기업UUID --confirm-code 기업코드 --reason 사유를 명시해 주세요.");
            var tenant=await db.Tenants.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==id)??throw new OrganizationException(404,"지정한 기업 ID가 없습니다.");
            Console.WriteLine($"대상 기업: {tenant.Name} / {tenant.Code} / {tenant.Id}");
            var service=sp.GetRequiredService<DevelopmentAccessService>();var actor=Environment.UserName+"@"+Environment.MachineName;
            if(args[0]=="revoke"){await service.Revoke(id,code,reason,actor);Write(new{tenantId=id,revoked=true});return 0;}
            if(!values.TryGetValue("--start",out var startRaw))throw new OrganizationException(400,"--start now 또는 시간대가 포함된 ISO 8601 일시를 지정해 주세요.");
            // Capture once; --days 30 is exactly 30 x 24 hours from this start, not a calendar month.
            var start=startRaw=="now"?sp.GetRequiredService<TimeProvider>().GetUtcNow():ParseDate(startRaw);
            DateTimeOffset end;
            if(values.TryGetValue("--days",out var daysRaw))
            {if(values.ContainsKey("--end")||!int.TryParse(daysRaw,out var days)||days<1||days>3650)throw new OrganizationException(400,"--days는 1~3650일이며 --end와 함께 지정할 수 없습니다.");end=start.AddDays(days);}
            else if(values.TryGetValue("--end",out var endRaw))end=ParseDate(endRaw);
            else throw new OrganizationException(400,"--end 종료 일시 또는 --days 일수를 지정해 주세요.");
            // PostgreSQL timestamps store microseconds. Preserve the exact duration at database precision.
            start=new DateTimeOffset(start.UtcTicks-start.UtcTicks%10,TimeSpan.Zero);end=new DateTimeOffset(end.UtcTicks-end.UtcTicks%10,TimeSpan.Zero);
            var grant=await service.Grant(id,code,start,end,reason,actor);
            Write(new{tenantId=id,startsAt=grant.StartsAt,endsAt=grant.EndsAt,durationSeconds=(grant.EndsAt-grant.StartsAt).TotalSeconds,billingUnchanged=true});return 0;
        }
        catch(OrganizationException e){Console.Error.WriteLine(e.Message);return 1;}
        catch{Console.Error.WriteLine("개발 테스트 접근을 처리하지 못했습니다. 로컬 DB 연결과 인자를 확인해 주세요. 결제 상태는 변경하지 않았습니다.");return 1;}
    }
    static DateTimeOffset ParseDate(string text)
    {
        if(!(text.EndsWith('Z')||System.Text.RegularExpressions.Regex.IsMatch(text,@"[+-]\d{2}:\d{2}$"))||!DateTimeOffset.TryParse(text,CultureInfo.InvariantCulture,DateTimeStyles.None,out var result))throw new OrganizationException(400,"일시는 시간대(Z 또는 +09:00)가 포함된 ISO 8601 형식으로 입력해 주세요.");
        return result;
    }
    static void Write(object value)=>Console.WriteLine(JsonSerializer.Serialize(value,new JsonSerializerOptions{WriteIndented=true}));
}
