using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using IebleWms.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Controllers;

// Read-only view over existing immutable audit records. Business movement histories
// remain in their original menus; no migration or copy of audit data is required.
[ApiController, Route("api/tenants/{tenantId:guid}/activity-log"), Authorize(Policy = "TenantMaster")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ActivityLogController(WmsDbContext db) : ControllerBase
{
    private static readonly (string Key, string Table, string? Action)[] Sources = [
        ("organization", "OrganizationChanges", null), ("permissions", "TenantPermissionChanges", "권한 설정 변경"),
        ("collaborators", "CollaboratorPermissionChanges", "외부 협력사 권한 변경"),
        ("warehouses", "WarehouseChanges", null), ("products", "ProductChanges", null), ("partners", "PartnerChanges", null)
    ];
    public sealed class Entry
    {
        public long Id { get; set; }
        public string Source { get; set; } = "";
        public string Action { get; set; } = "";
        public string Actor { get; set; } = "";
        public string ChangedAt { get; set; } = "";
    }
    public sealed class Detail
    {
        public string BeforeJson { get; set; } = "{}";
        public string AfterJson { get; set; } = "{}";
        public string? Reason { get; set; }
    }
    [HttpGet]
    public async Task<IActionResult> List(Guid tenantId, string? source, string? search, DateOnly? start, DateOnly? end, int page = 1, CancellationToken token = default)
    {
        if (source is { Length: > 0 } && !Sources.Any(x => x.Key == source) || search?.Length > 200 || start > end || start == DateOnly.MinValue || end == DateOnly.MaxValue)
            return BadRequest(new { message = "조회 조건과 날짜 범위를 확인해 주세요." });
        page = Math.Clamp(page, 1, 1000000);
        var time = db.Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite" ? "strftime('%Y-%m-%dT%H:%M:%fZ', c.\"ChangedAt\")" : "to_char(c.\"ChangedAt\" AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";
        var branches = Sources.Where(x => string.IsNullOrEmpty(source) || source == x.Key).Select(x =>
            $"SELECT c.\"Id\", '{x.Key}' AS \"Source\", {(x.Action is null ? "c.\"Action\"" : $"'{x.Action}'")} AS \"Action\", COALESCE(u.\"DisplayName\", '알 수 없음') AS \"Actor\", {time} AS \"ChangedAt\" FROM \"{x.Table}\" c LEFT JOIN \"AspNetUsers\" u ON u.\"Id\" = c.\"ChangedByUserId\" WHERE c.\"TenantId\" = {{0}}");
        var query = db.Database.SqlQuery<Entry>(FormattableStringFactory.Create(string.Join(" UNION ALL ", branches), tenantId));
        // ISO UTC strings provide the same chronological order in PostgreSQL and SQLite fixtures.
        if (start.HasValue) { var from = Boundary(start.Value); query = query.Where(x => string.Compare(x.ChangedAt, from) >= 0); }
        if (end.HasValue) { var until = Boundary(end.Value.AddDays(1)); query = query.Where(x => string.Compare(x.ChangedAt, until) < 0); }
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLowerInvariant(); query = query.Where(x => x.Actor.ToLower().Contains(term) || x.Action.ToLower().Contains(term)); }
        var total = await query.CountAsync(token);
        var items = await query.OrderByDescending(x => x.ChangedAt).ThenBy(x => x.Source).ThenByDescending(x => x.Id).Skip((page - 1) * 20).Take(20).ToArrayAsync(token);
        return Ok(new { items, total, page, pageSize = 20 });
    }
    [HttpGet("{source}/{id:long}")]
    public async Task<IActionResult> Get(Guid tenantId, string source, long id, CancellationToken token)
    {
        var definition = Sources.SingleOrDefault(x => x.Key == source);
        if (definition.Table is null) return NotFound();
        var reason = source == "organization" ? "\"Reason\"" : "NULL";
        var detail = await db.Database.SqlQuery<Detail>(FormattableStringFactory.Create(
            $"SELECT \"BeforeJson\", \"AfterJson\", {reason} AS \"Reason\" FROM \"{definition.Table}\" WHERE \"TenantId\" = {{0}} AND \"Id\" = {{1}}", tenantId, id)).SingleOrDefaultAsync(token);
        return detail is null ? NotFound() : Ok(new { before = SafeJson(detail.BeforeJson), after = SafeJson(detail.AfterJson), detail.Reason });
    }
    private static string Boundary(DateOnly date) => new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(9)).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
    private static JsonNode? SafeJson(string json)
    {
        try { var node = JsonNode.Parse(json); Redact(node); return node; }
        catch (System.Text.Json.JsonException) { return JsonValue.Create("내용을 표시할 수 없습니다."); }
    }
    private static void Redact(JsonNode? node)
    {
        if (node is JsonObject obj)
            foreach (var pair in obj.ToArray())
                if (new[] { "password", "secret", "token", "securitystamp", "concurrencystamp", "cookie" }.Any(key => pair.Key.Contains(key, StringComparison.OrdinalIgnoreCase))) obj.Remove(pair.Key);
                else Redact(pair.Value);
        else if (node is JsonArray array) foreach (var item in array) Redact(item);
    }
}
