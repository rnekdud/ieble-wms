using IebleWms.Api.Data;
using IebleWms.Api.Auth;

var bootstrap = args.Contains("--bootstrap-admin", StringComparer.Ordinal);
if (bootstrap && args.Length != 1)
{
    Console.Error.WriteLine("초기화 명령에는 추가 인자를 전달하지 마세요. 이메일과 비밀번호는 터미널에서 입력합니다.");
    Environment.ExitCode = 1;
    return;
}
var builder = WebApplication.CreateBuilder(args.Where(x => x != "--bootstrap-admin").ToArray());
if (bootstrap)
{
    builder.Logging.ClearProviders();
    try { IebleWms.Api.Administration.BootstrapAdminCommand.ConfigureConnection(builder); }
    catch { Console.Error.WriteLine("개발 환경의 ieble_wms_dev 연결 설정을 확인해 주세요. 초기화는 실행되지 않았습니다."); Environment.ExitCode = 1; return; }
}

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddWmsData(builder.Configuration);
builder.Services.AddWmsAuthentication(builder.Environment);
builder.Services.AddOptions<LoginSessionOptions>()
    .Bind(builder.Configuration.GetSection(LoginSessionOptions.SectionName))
    .ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<IebleWms.Api.Billing.BillingPolicyOptions>()
    .Bind(builder.Configuration.GetSection(IebleWms.Api.Billing.BillingPolicyOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(policy => { try { TimeZoneInfo.FindSystemTimeZoneById(policy.TimeZoneId); return true; } catch { return false; } }, "Billing policy time zone must be valid.")
    .ValidateOnStart();
builder.Services.AddScoped<IebleWms.Api.Billing.BillingAccessService>();
builder.Services.Configure<IebleWms.Api.Billing.TossPaymentsOptions>(builder.Configuration.GetSection(IebleWms.Api.Billing.TossPaymentsOptions.SectionName));

builder.Services.AddScoped<Npgsql.NpgsqlConnection>(_ =>
    new Npgsql.NpgsqlConnection(
        builder.Configuration.GetConnectionString("DefaultConnection")
    )
);

var app = builder.Build();
if (bootstrap)
{
    Environment.ExitCode = await IebleWms.Api.Administration.BootstrapAdminCommand.RunAsync(app.Services);
    await app.DisposeAsync();
    return;
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    context.Response.StatusCode = 500;
    await context.Response.WriteAsJsonAsync(new { message = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
}));
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    await next();
});
app.UseAuthentication();
app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers();

app.MapGet("/api/health/db", async (Npgsql.NpgsqlConnection db) =>
{
    await db.OpenAsync();

    await using var command = new Npgsql.NpgsqlCommand(
        "SELECT current_database()", db);

    var database = await command.ExecuteScalarAsync();

    return Results.Ok(new
    {
        status = "connected",
        database
    });
});

app.Run();

public partial class Program { }
