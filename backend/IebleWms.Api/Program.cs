using IebleWms.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddWmsData(builder.Configuration);

builder.Services.AddScoped<Npgsql.NpgsqlConnection>(_ =>
    new Npgsql.NpgsqlConnection(
        builder.Configuration.GetConnectionString("DefaultConnection")
    )
);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

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
