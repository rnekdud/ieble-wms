using System.Text;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace IebleWms.Api.Administration;

public static class BootstrapAdminCommand
{
    public static void ConfigureConnection(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment()) throw new InvalidOperationException();
        var connection = builder.Configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connection))
        {
            var directory = new DirectoryInfo(builder.Environment.ContentRootPath);
            while (directory is not null && !File.Exists(Path.Combine(directory.FullName, ".env"))) directory = directory.Parent;
            if (directory is null) throw new InvalidOperationException();
            var values = new Dictionary<string, string>();
            foreach (var raw in File.ReadLines(Path.Combine(directory.FullName, ".env")))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith('#')) continue;
                var parts = line.Split('=', 2);
                if (parts.Length != 2) throw new InvalidOperationException();
                var value = parts[1].Trim();
                if (value.Length >= 2 && ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\''))) value = value[1..^1];
                values[parts[0].Trim()] = value;
            }
            connection = new NpgsqlConnectionStringBuilder { Host = "127.0.0.1", Port = 5435, Database = values["POSTGRES_DB"], Username = values["POSTGRES_USER"], Password = values["POSTGRES_PASSWORD"] }.ConnectionString;
        }
        var settings = new NpgsqlConnectionStringBuilder(connection);
        if (settings.Host is not ("127.0.0.1" or "localhost") || settings.Port != 5435 || settings.Database != "ieble_wms_dev") throw new InvalidOperationException();
        settings.IncludeErrorDetail = false;
        builder.Configuration["ConnectionStrings:DefaultConnection"] = settings.ConnectionString;
    }

    public static async Task<int> RunAsync(IServiceProvider services)
    {
        if (Console.IsInputRedirected) { Console.Error.WriteLine("대화형 터미널에서 실행해 주세요. 비밀번호 인자·파이프 입력은 지원하지 않습니다."); return 1; }
        try
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
            await db.Database.OpenConnectionAsync();
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "SELECT current_database()";
            if ((string?)await command.ExecuteScalarAsync() != "ieble_wms_dev" || (await db.Database.GetPendingMigrationsAsync()).Any())
                throw new InvalidOperationException();
            if (await db.AdministratorBootstraps.AnyAsync()) { Console.WriteLine("최초 관리자 생성이 이미 완료되었습니다."); return 1; }
            Console.Write("관리자 이메일: "); var email = Console.ReadLine() ?? "";
            Console.Write("표시 이름: "); var name = Console.ReadLine() ?? "";
            Console.Write("비밀번호 (입력 내용 숨김): "); var password = ReadSecret();
            Console.Write("비밀번호 확인 (입력 내용 숨김): "); var confirmation = ReadSecret();
            if (password != confirmation) { Console.Error.WriteLine("비밀번호 확인이 일치하지 않습니다."); return 1; }
            var result = await scope.ServiceProvider.GetRequiredService<BootstrapAdminService>().CreateAsync(email, name, password);
            Console.WriteLine(result.Message);
            return result.Succeeded ? 0 : 1;
        }
        catch (Exception)
        {
            // No exception details: provider errors could contain credentials or personal information.
            Console.Error.WriteLine("관리자를 생성하지 못했습니다. 개발 DB 연결 및 마이그레이션 적용 상태를 확인해 주세요.");
            return 1;
        }
    }

    private static string ReadSecret()
    {
        var text = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return text.ToString(); }
            if (key.Key == ConsoleKey.Escape) throw new OperationCanceledException();
            if (key.Key == ConsoleKey.Backspace) { if (text.Length > 0) text.Length--; }
            else if (!char.IsControl(key.KeyChar)) { if (text.Length >= 128) throw new InvalidOperationException(); text.Append(key.KeyChar); }
        }
    }
}
