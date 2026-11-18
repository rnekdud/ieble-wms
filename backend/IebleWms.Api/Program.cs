using IebleWms.Api.Data;
using IebleWms.Api.Auth;
using IebleWms.Api.Hosting;

var developmentAccess = args.FirstOrDefault() == "--development-access";
var bootstrap = args.Contains("--bootstrap-admin", StringComparer.Ordinal);
if (bootstrap && args.Length != 1)
{
    Console.Error.WriteLine("초기화 명령에는 추가 인자를 전달하지 마세요. 이메일과 비밀번호는 터미널에서 입력합니다.");
    Environment.ExitCode = 1;
    return;
}
var builder = WebApplication.CreateBuilder(developmentAccess ? [] : args.Where(x => x != "--bootstrap-admin").ToArray());
if (bootstrap || developmentAccess)
{
    builder.Logging.ClearProviders();
    try { IebleWms.Api.Administration.BootstrapAdminCommand.ConfigureConnection(builder); }
    catch { Console.Error.WriteLine(developmentAccess ? "개발 테스트 접근 명령은 Development 환경의 로컬 ieble_wms_dev 연결에서만 실행할 수 있습니다." : "개발 환경의 ieble_wms_dev 연결 설정을 확인해 주세요. 초기화는 실행되지 않았습니다."); Environment.ExitCode = 1; return; }
}

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSingleton<IebleWms.Api.Warehousing.PlanImportService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<IebleWms.Api.Warehousing.PlanImportService>());
builder.Services.AddWmsDeployment(builder.Configuration);
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddWmsData(builder.Configuration);
builder.Services.AddWmsAuthentication(builder.Environment);
builder.Services.AddOptions<IebleWms.Api.Reports.StockOverviewOptions>()
    .Bind(builder.Configuration.GetSection("StockOverview")).ValidateDataAnnotations()
    .Validate(options => { try { TimeZoneInfo.FindSystemTimeZoneById(options.TimeZoneId); return true; } catch { return false; } }, "Stock overview time zone must be valid.")
    .ValidateOnStart();
builder.Services.AddOptions<LoginSessionOptions>()
    .Bind(builder.Configuration.GetSection(LoginSessionOptions.SectionName))
    .ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<IebleWms.Api.Billing.BillingPolicyOptions>()
    .Bind(builder.Configuration.GetSection(IebleWms.Api.Billing.BillingPolicyOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(policy => { try { TimeZoneInfo.FindSystemTimeZoneById(policy.TimeZoneId); return true; } catch { return false; } }, "Billing policy time zone must be valid.")
    .ValidateOnStart();
builder.Services.AddSingleton<IebleWms.Api.Billing.ILocalDevelopmentEnvironment, IebleWms.Api.Billing.LocalDevelopmentEnvironment>();
builder.Services.AddScoped<IebleWms.Api.Billing.DevelopmentAccessService>();
builder.Services.AddScoped<IebleWms.Api.Billing.BillingAccessService>();
builder.Services.AddScoped<IebleWms.Api.Billing.SubscriptionService>();
builder.Services.AddScoped<IebleWms.Api.Support.SupportService>();
builder.Services.Configure<IebleWms.Api.Billing.TossPaymentsOptions>(builder.Configuration.GetSection(IebleWms.Api.Billing.TossPaymentsOptions.SectionName));

builder.Services.AddScoped<Npgsql.NpgsqlConnection>(_ =>
    new Npgsql.NpgsqlConnection(
        builder.Configuration.GetConnectionString("DefaultConnection")
    )
);

var app = builder.Build();
if (developmentAccess)
{
    Environment.ExitCode = await IebleWms.Api.Billing.DevelopmentAccessCommand.RunAsync(app.Services, args.Skip(1).ToArray());
    await app.DisposeAsync();
    return;
}
if (bootstrap)
{
    Environment.ExitCode = await IebleWms.Api.Administration.BootstrapAdminCommand.RunAsync(app.Services);
    await app.DisposeAsync();
    return;
}

// Forward only from explicitly configured trusted proxies, before HTTPS and authentication.
app.UseForwardedHeaders();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    context.Response.StatusCode = error is IebleWms.Api.Organization.OrganizationException known ? known.StatusCode : 500;
    await context.Response.WriteAsJsonAsync(new { message = error is IebleWms.Api.Organization.OrganizationException expected
        ? expected.Message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
}));
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    await next();
});
app.UseAuthentication();
app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers();

app.MapGet("/api/health/live", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(new { status = "alive" });
});
app.MapGet("/api/health/db", async (Npgsql.NpgsqlConnection db, HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    timeout.CancelAfter(TimeSpan.FromSeconds(5));
    try
    {
        await db.OpenAsync(timeout.Token);
        await using var command = new Npgsql.NpgsqlCommand(app.Environment.IsDevelopment() ? "SELECT current_database()" : "SELECT 1", db);
        var result = await command.ExecuteScalarAsync(timeout.Token);
        return app.Environment.IsDevelopment()
            ? Results.Ok(new { status = "connected", database = result })
            : Results.Ok(new { status = "connected" });
    }
    catch (Exception error) when (error is System.Data.Common.DbException or InvalidOperationException or OperationCanceledException)
    {
        return Results.Json(new { status = "unavailable" }, statusCode: 503);
    }
});

app.Run();

public partial class Program { }
