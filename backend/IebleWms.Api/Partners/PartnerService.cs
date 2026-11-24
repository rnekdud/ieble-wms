using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
namespace IebleWms.Api.Partners;

public sealed class PartnerService(WmsDbContext db, TimeProvider clock)
{
    public static readonly string[] Types = ["SUPPLIER", "CUSTOMER", "BOTH"];

    public async Task<object> List(Guid tenant, string? search, string type, string status, string? usage, int page, int pageSize, CancellationToken ct)
    {
        if (search?.Length > 100 || (type != "all" && !Types.Contains(type)) || status is not ("all" or "active" or "inactive") || usage is not (null or "receipt" or "shipment") || page is < 1 or > 100000 || pageSize is not (20 or 50 or 100))
            throw Error(400, "검색 조건을 확인해 주세요.");
        var query = db.Partners.AsNoTracking().Where(x => x.TenantId == tenant);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().Normalize(NormalizationForm.FormKC).ToLowerInvariant();
            var number = Compact(term).ToUpperInvariant();
            query = query.Where(x => x.Code.ToLower().Contains(term) || x.Name.ToLower().Contains(term) ||
                (x.Email != null && x.Email.ToLower().Contains(term)) ||
                (x.BusinessRegistrationNumber != null && x.BusinessRegistrationNumber.ToLower().Contains(term)) ||
                (number != "" && x.NormalizedBusinessNumber != null && x.NormalizedBusinessNumber.Contains(number)));
        }
        if (type != "all") query = query.Where(x => x.Type == type);
        if (status != "all") query = query.Where(x => x.IsActive == (status == "active"));
        // New inbound/outbound selectors opt in; historical documents still resolve by stable ID.
        if (usage != null)
        {
            var requiredType = usage == "receipt" ? "SUPPLIER" : "CUSTOMER";
            query = query.Where(x => x.IsActive && (x.Type == requiredType || x.Type == "BOTH"));
        }
        var total = await query.CountAsync(ct);
        page = Math.Min(page, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)));
        var items = await query.OrderBy(x => x.NormalizedCode).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new { items, total, page, pageSize };
    }
    public Task<Partner> Detail(Guid tenant, Guid id, CancellationToken ct) => Find(tenant, id, ct);

    public async Task<object> CheckBusinessNumber(Guid tenant, string? number, string country, Guid? excludeId, CancellationToken ct)
    {
        var normalized = BusinessNumber(number, country);
        var matches = await db.Partners.AsNoTracking().Where(x => x.TenantId == tenant && x.Id != excludeId && normalized != null && x.RegistrationCountry == country && x.NormalizedBusinessNumber == normalized)
            .OrderBy(x => x.Code).Select(x => new { x.Id, x.Code, x.Name }).Take(5).ToListAsync(ct);
        return new { matches };
    }

    public async Task<object> SavePartner(Guid tenant, Guid actor, Guid? id, PartnerRequest r, CancellationToken ct)
    {
        await using var tx = await Begin(tenant, ct);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r))));
        if (!id.HasValue)
        {
            if (r.RequestId == Guid.Empty) throw Error(400, "등록 요청 번호를 확인해 주세요.");
            var replay = await db.Partners.SingleOrDefaultAsync(x => x.TenantId == tenant && x.CreationRequestId == r.RequestId, ct);
            if (replay != null)
            {
                if (replay.CreationHash != hash) throw Error(409, "같은 등록 요청의 내용이 달라졌습니다. 목록에서 기존 거래처를 확인해 주세요.");
                var result = await Result(replay, ct); await tx.CommitAsync(ct); return result;
            }
        }
        var p = id.HasValue ? await Find(tenant, id.Value, ct) : new Partner { TenantId = tenant, CreationRequestId = r.RequestId, CreationHash = hash };
        if (id.HasValue) CheckVersion(p, r.Version);
        var before = id.HasValue ? Snapshot(p) : JsonSerializer.SerializeToElement(new { });
        var code = string.IsNullOrWhiteSpace(r.Code) ? (id.HasValue ? p.Code : await BusinessCodes.Next(db, tenant, "BP", ct)) : Required(r.Code, 64, "거래처코드");
        var normalizedCode = code.ToUpperInvariant();
        if (await db.Partners.AnyAsync(x => x.TenantId == tenant && x.NormalizedCode == normalizedCode && x.Id != p.Id, ct))
            throw Error(409, "이미 사용 중인 거래처 코드입니다.");
        await BusinessCodes.ObservePartner(db, tenant, normalizedCode, ct);
        if (!Types.Contains(r.Type)) throw Error(400, "거래처 유형을 선택해 주세요.");
        p.Code = code; p.NormalizedCode = normalizedCode; p.Name = Required(r.Name, 200, "거래처명"); p.Type = r.Type;
        p.NormalizedBusinessNumber = BusinessNumber(r.BusinessRegistrationNumber, r.RegistrationCountry);
        p.RegistrationCountry = r.RegistrationCountry; p.BusinessRegistrationNumber = Optional(r.BusinessRegistrationNumber, 64, "사업자등록번호");
        p.RepresentativeName = Optional(r.RepresentativeName, 100, "대표자명");
        p.PostalCode = Optional(r.PostalCode, 20, "우편번호");
        if(r.DefaultShippingPostalCode != null) p.DefaultShippingPostalCode = Optional(r.DefaultShippingPostalCode, 20, "기본 출고지 우편번호");
        if(r.DefaultShippingAddress != null) p.DefaultShippingAddress = Optional(r.DefaultShippingAddress, 500, "기본 출고지");
        if(r.DefaultShippingAddressDetail != null) p.DefaultShippingAddressDetail = Optional(r.DefaultShippingAddressDetail, 500, "기본 출고지 상세주소");
        p.Address = Optional(r.Address, 500, "주소"); p.AddressDetail = Optional(r.AddressDetail, 500, "상세주소");
        p.Phone = Phone(r.Phone); p.ContactPhone = Phone(r.ContactPhone);
        p.Email = Optional(r.Email, 254, "이메일");
        if (p.Email != null && !new EmailAddressAttribute().IsValid(p.Email)) throw Error(400, "이메일 형식을 확인해 주세요.");
        p.ContactName = Optional(r.ContactName, 100, "담당자명");
        p.PaymentTerms = Optional(r.PaymentTerms, 500, "결제조건");
        p.Notes = Optional(r.Notes, 2000, "비고", true); p.IsActive = r.IsActive;
        if (!id.HasValue) db.Partners.Add(p);
        Audit(p, actor, id.HasValue ? "PartnerUpdated" : "PartnerCreated", before);
        await Save(ct); var response = await Result(p, ct); await tx.CommitAsync(ct); return response;
    }
    public async Task<object> Status(Guid tenant, Guid actor, Guid id, PartnerStatusRequest r, CancellationToken ct)
    {
        await using var tx = await Begin(tenant, ct);
        var p = await Find(tenant, id, ct); CheckVersion(p, r.Version);
        var before = Snapshot(p); p.IsActive = r.IsActive; Audit(p, actor, "PartnerStatusChanged", before);
        await Save(ct); var result = await Result(p, ct); await tx.CommitAsync(ct); return result;
    }
    async Task<object> Result(Partner p, CancellationToken ct)
    {
        var duplicate = p.NormalizedBusinessNumber != null && await db.Partners.AnyAsync(x => x.TenantId == p.TenantId && x.Id != p.Id && x.RegistrationCountry == p.RegistrationCountry && x.NormalizedBusinessNumber == p.NormalizedBusinessNumber, ct);
        return new { partner = p, warning = duplicate ? "같은 사업자등록번호의 거래처가 있습니다. 지점·거래 관계에 따른 별도 등록인지 확인해 주세요." : null };
    }
    async Task<Partner> Find(Guid tenant, Guid id, CancellationToken ct) => await db.Partners.SingleOrDefaultAsync(x => x.TenantId == tenant && x.Id == id, ct) ?? throw Error(404, "거래처를 찾을 수 없습니다.");
    static void CheckVersion(Partner p, Guid version)
    {
        if (version == Guid.Empty || p.Version != version) throw Error(409, "다른 사용자가 거래처를 변경했습니다. 상세 정보를 다시 열어 확인해 주세요.");
    }
    static string Required(string raw, int max, string label) => Optional(raw, max, label)?.Normalize(NormalizationForm.FormKC) is { } value && value.Length <= max ? value : throw Error(400, $"{label}은(는) 1~{max}자로 입력해 주세요.");
    static string? Optional(string? raw, int max, string label, bool multiline = false)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = raw.Trim();
        if (value.Length > max || value.Any(c => char.IsControl(c) && !(multiline && c is '\n' or '\r' or '\t'))) throw Error(400, $"{label} 입력 형식을 확인해 주세요. 최대 {max}자입니다.");
        return value;
    }
    static string? Phone(string? raw)
    {
        var value = Optional(raw, 50, "전화번호");
        if (value != null && (!Regex.IsMatch(value, @"^[0-9+().\- ]+$") || !value.Any(char.IsAsciiDigit))) throw Error(400, "전화번호는 숫자와 +, -, 공백, 괄호 등으로 입력해 주세요.");
        return value;
    }
    static string Compact(string value) => Regex.Replace(value, @"[\s-]", "");
    public static string? BusinessNumber(string? raw, string country)
    {
        if (country is not ("KR" or "OTHER")) throw Error(400, "사업자번호 구분을 확인해 주세요.");
        var value = Optional(raw, 64, "사업자등록번호");
        if (value == null) return null;
        var normalized = Compact(value).ToUpperInvariant();
        if (country == "KR" && !Regex.IsMatch(normalized, "^[0-9]{10}$")) throw Error(400, "국내 사업자등록번호는 하이픈을 제외한 숫자 10자리로 입력해 주세요.");
        if (normalized.Length == 0) throw Error(400, "사업자등록번호를 확인해 주세요.");
        return normalized;
    }
    async Task<IDbContextTransaction> Begin(Guid tenant, CancellationToken ct)
    {
        var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"partner:" + tenant},0))", ct);
            return tx;
        }
        catch { await tx.DisposeAsync(); throw; }
    }
    async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Error(409, "다른 사용자가 거래처를 변경했습니다. 상세 정보를 다시 열어 주세요."); }
        catch (DbUpdateException) { throw Error(409, "거래처코드 중복 또는 참조 데이터 변경으로 저장하지 못했습니다. 입력 내용을 확인해 주세요."); }
    }
    static JsonElement Snapshot(Partner p) => JsonSerializer.SerializeToElement(p);
    void Audit(Partner p, Guid actor, string action, object before) => db.PartnerChanges.Add(new() { TenantId = p.TenantId, TargetId = p.Id, ChangedByUserId = actor, ChangedAt = clock.GetUtcNow(), Action = action, BeforeJson = JsonSerializer.Serialize(before), AfterJson = JsonSerializer.Serialize(Snapshot(p)) });
    static OrganizationException Error(int status, string message) => new(status, message);
}
