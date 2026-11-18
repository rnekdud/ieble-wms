using System.Globalization;
using System.Text.Json;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Services;

public static class BusinessCodes
{
    public static async Task<string> Next(WmsDbContext db, Guid tenant, string prefix, CancellationToken ct)
    {
        var counter = await Counter(db, tenant, prefix, ct);
        var codes = Existing(db, tenant, prefix);
        string candidate;
        do
        {
            if (counter.LastValue == long.MaxValue) throw new OrganizationException(409, "자동 코드 범위를 초과했습니다. 관리자에게 문의해 주세요.");
            candidate = prefix + (++counter.LastValue).ToString("D2", CultureInfo.InvariantCulture);
        } while (await codes.AnyAsync(x => x == candidate, ct));
        return candidate;
    }
    // A manually supplied PR code must not become reusable after it is renamed or deleted.
    public static async Task ObserveProduct(WmsDbContext db, Guid tenant, string code, CancellationToken ct)
    {
        var number = Suffix(code, "PR");
        if (number == 0) return;
        var counter = await Counter(db, tenant, "PR", ct);
        counter.LastValue = Math.Max(counter.LastValue, number);
    }
    public static async Task ObservePartner(WmsDbContext db, Guid tenant, string code, CancellationToken ct)
    {
        var number = Suffix(code, "BP");
        if (number == 0) return;
        var counter = await Counter(db, tenant, "BP", ct);
        counter.LastValue = Math.Max(counter.LastValue, number);
    }
    static async Task<BusinessCodeCounter> Counter(WmsDbContext db, Guid tenant, string prefix, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction == null) throw new InvalidOperationException("Business codes require the owning business transaction.");
        // Serialize initialization and increment across processes, not just within this server.
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"business-code:" + tenant + ":" + prefix}, 0))", ct);
        var codes = Existing(db, tenant, prefix);
        var counter = db.BusinessCodeCounters.Local.SingleOrDefault(x => x.TenantId == tenant && x.Prefix == prefix)
            ?? await db.BusinessCodeCounters.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Prefix == prefix, ct);
        if (counter == null)
        {
            var existing = await codes.Where(x => x.StartsWith(prefix)).ToListAsync(ct);
            var last = existing.Select(x => Suffix(x, prefix)).DefaultIfEmpty().Max();
            // Existing audit history also reserves deleted/renamed compact product and warehouse codes.
            IQueryable<string>? history = prefix switch {
                "BP" => db.PartnerChanges.Where(x => x.TenantId == tenant).Select(x => x.BeforeJson).Concat(db.PartnerChanges.Where(x => x.TenantId == tenant).Select(x => x.AfterJson)),
                "PR" => db.ProductChanges.Where(x => x.TenantId == tenant).Select(x => x.BeforeJson).Concat(db.ProductChanges.Where(x => x.TenantId == tenant).Select(x => x.AfterJson)),
                "WH" => db.WarehouseChanges.Where(x => x.TenantId == tenant).Select(x => x.BeforeJson).Concat(db.WarehouseChanges.Where(x => x.TenantId == tenant).Select(x => x.AfterJson)), _ => null };
            if (history != null) await foreach (var json in history.AsAsyncEnumerable().WithCancellation(ct)) {
                try { using var document = JsonDocument.Parse(json); last = Math.Max(last, Historical(document.RootElement, prefix)); }
                catch (JsonException) { throw new OrganizationException(409, "기존 코드 이력을 확인할 수 없습니다. 관리자에게 문의해 주세요."); }
            }
            counter = new() { TenantId = tenant, Prefix = prefix, LastValue = last };
            db.BusinessCodeCounters.Add(counter);
        }
        return counter;
    }
    static long Historical(JsonElement value, string prefix)
    {
        if (value.ValueKind == JsonValueKind.Array) return value.EnumerateArray().Select(x => Historical(x, prefix)).DefaultIfEmpty().Max();
        if (value.ValueKind != JsonValueKind.Object) return 0;
        return value.EnumerateObject().Select(p => p.Name.Equals("Code", StringComparison.OrdinalIgnoreCase) && p.Value.ValueKind == JsonValueKind.String
            ? Suffix(p.Value.GetString()!.ToUpperInvariant(), prefix) : Historical(p.Value, prefix)).DefaultIfEmpty().Max();
    }
    static long Suffix(string code, string prefix) => code.StartsWith(prefix, StringComparison.Ordinal)
        && code.Length > prefix.Length && code[prefix.Length..].All(char.IsAsciiDigit)
        && long.TryParse(code.AsSpan(prefix.Length), NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : 0;
    static IQueryable<string> Existing(WmsDbContext db, Guid tenant, string prefix) => prefix switch
    {
        "BP" => db.Partners.Where(x => x.TenantId == tenant).Select(x => x.NormalizedCode),
        "PR" => db.Products.Where(x => x.TenantId == tenant).Select(x => x.NormalizedCode),
        "IN" => db.InboundReceipts.Where(x => x.TenantId == tenant).Select(x => x.Number),
        "PK" => db.OutboundShipments.Where(x => x.TenantId == tenant).Select(x => x.Number),
        "QA" => db.BillingFeedbacks.Where(x => x.TenantId == tenant).Select(x => x.Number ?? ""),
        "WH" => db.Warehouses.Where(x => x.TenantId == tenant).Select(x => x.Code),
        "ST" => db.Stocktakes.Where(x => x.TenantId == tenant).Select(x => x.Number),
        "MV" or "AD" => db.InventoryOperations.Where(x => x.TenantId == tenant).Select(x => x.Number),
        _ => throw new ArgumentOutOfRangeException(nameof(prefix))
    };
}
