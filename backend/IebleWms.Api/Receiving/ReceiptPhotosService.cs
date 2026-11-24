using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Support;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Receiving;

public sealed partial class ReceiptService
{
    public async Task<object> PhotoOptions(Guid tenant, CancellationToken ct)
    {
        // Ensure the storage migration is available before the UI accepts new draft photos.
        await db.ReceiptPhotos.AsNoTracking().Where(x => x.TenantId == tenant).Select(x => x.Id).Take(1).ToArrayAsync(ct);
        return new { maxCount = 10, maxBytes = SupportFiles.MaxBytes, formats = new[] { "image/jpeg", "image/png", "image/webp" } };
    }
    public async Task<object> Photos(Guid tenant, Guid id, CancellationToken ct)
    {
        var doc = await Find(tenant, id, ct);
        var photos = await db.ReceiptPhotos.AsNoTracking().Where(x => x.TenantId == tenant && x.ReceiptId == id)
            .OrderBy(x => x.Position).Select(x => new { x.Id, x.FileName, x.ContentType, x.Position }).ToListAsync(ct);
        return new { photos, doc.Version, photosVersion = PhotoVersion(photos.Select(x => x.Id)) };
    }
    public async Task<(byte[] Content, string ContentType)> Photo(Guid tenant, Guid id, Guid photoId, bool thumbnail, CancellationToken ct)
    {
        // Project only the requested bytes: thumbnail requests never load the original blob.
        var photo = await db.ReceiptPhotos.AsNoTracking().Where(x => x.TenantId == tenant && x.ReceiptId == id && x.Id == photoId)
            .Select(x => new { Content = thumbnail ? x.Thumbnail : x.Content, ContentType = thumbnail ? "image/jpeg" : x.ContentType }).SingleOrDefaultAsync(ct)
            ?? throw Error("입고 사진을 찾을 수 없습니다.", 404);
        return (photo.Content, photo.ContentType);
    }
    public async Task<object> UpdatePhotos(Guid tenant, Guid actor, Guid id, ReceiptPhotosRequest r, CancellationToken ct)
    {
        await using var tx = await Begin(tenant, ct);
        var doc = await Find(tenant, id, ct); Version(doc, r.Version); State(doc, "Planned", "Inspecting");
        await SavePhotos(doc, actor, r.Photos, r.PhotosVersion, ct);
        await Save(ct); await tx.CommitAsync(ct);
        return new { detail = await Detail(tenant, id, ct), gallery = await Photos(tenant, id, ct) };
    }
    async Task SavePhotos(InboundReceipt doc, Guid actor, ReceiptPhotoRequest[]? requests, string? version, CancellationToken ct, bool creatingReceipt = false)
    {
        if (requests == null) return; // Older clients preserve existing photos.
        if (requests.Length > 10) throw Error("입고 사진은 최대 10장입니다.");
        var old = await db.ReceiptPhotos.Where(x => x.TenantId == doc.TenantId && x.ReceiptId == doc.Id).OrderBy(x => x.Position).ToListAsync(ct);
        if (!creatingReceipt && version != PhotoVersion(old.Select(x => x.Id))) throw Error("입고 사진이 변경되었습니다. 사진 변경을 취소하고 상세를 다시 열어 주세요.", 409);
        var result = new List<ReceiptPhoto>(); var retained = new HashSet<Guid>();
        foreach (var item in requests) {
            if (item.Id.HasValue) {
                var existing = old.SingleOrDefault(x => x.Id == item.Id) ?? throw Error("이 입고 건에 속한 사진을 선택해 주세요.");
                if (!retained.Add(existing.Id) || item.Base64 != null || item.ThumbnailBase64 != null) throw Error("중복 사진 또는 잘못된 변경 요청입니다.");
                result.Add(existing); continue;
            }
            var bytes = PhotoBytes(item.Base64, SupportFiles.MaxBytes);
            var name = Path.GetFileName((item.FileName ?? "").Replace('\\', '/'));
            if (name.Length is 0 or > 160 || name.Any(char.IsControl)) throw Error("사진 파일명을 확인해 주세요.");
            var ext = Path.GetExtension(name).ToLowerInvariant(); string mime;
            if (ext == ".webp") {
                if (bytes.Length < 20 || !bytes.AsSpan(0,4).SequenceEqual("RIFF"u8) || !bytes.AsSpan(8,4).SequenceEqual("WEBP"u8) ||
                    System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4,4)) != bytes.Length - 8 ||
                    !(bytes.AsSpan(12,4).SequenceEqual("VP8 "u8) || bytes.AsSpan(12,4).SequenceEqual("VP8L"u8) || bytes.AsSpan(12,4).SequenceEqual("VP8X"u8))) throw Error("WebP 사진 형식을 확인해 주세요.");
                mime = "image/webp";
            } else {
                if (ext is not (".png" or ".jpg" or ".jpeg")) throw Error("JPG·PNG·WebP 사진만 지원합니다. HEIC/HEIF는 JPG로 변환해 주세요.");
                using var stream = new MemoryStream(bytes);
                mime = (await SupportFiles.Read([new FormFile(stream,0,bytes.Length,"photo",name)],ct))[0].ContentType;
            }
            if (item.ContentType != mime) throw Error("사진의 실제 형식과 MIME 유형이 일치하지 않습니다.");
            var thumb = PhotoBytes(item.ThumbnailBase64, 256 * 1024);
            using var thumbStream = new MemoryStream(thumb);
            await SupportFiles.Read([new FormFile(thumbStream,0,thumb.Length,"thumbnail","thumbnail.jpg")],ct);
            result.Add(new() { TenantId = doc.TenantId, ReceiptId = doc.Id, FileName = name, ContentType = mime, Content = bytes, Thumbnail = thumb, CreatedAt = clock.GetUtcNow() });
        }
        // Validate all images before any removal; the receipt transaction also owns newly added blobs.
        var before = old.Select(x => new { x.Id, x.FileName, x.Position }).ToArray();
        db.ReceiptPhotos.RemoveRange(old.Where(x => !retained.Contains(x.Id)));
        for (var i = 0; i < result.Count; i++) { result[i].Position = i; if (!retained.Contains(result[i].Id)) db.ReceiptPhotos.Add(result[i]); }
        AddChange(doc, actor, "PhotosChanged", before, result.Select(x => new { x.Id, x.FileName, x.Position }).ToArray());
    }
    static string PhotoVersion(IEnumerable<Guid> ids) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(string.Join(",", ids))));
    static byte[] PhotoBytes(string? value, int limit)
    {
        if (string.IsNullOrEmpty(value) || value.Length > ((limit + 2) / 3) * 4) throw Error("입고 사진은 파일당 5MB 이하로 선택해 주세요.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(value); } catch (FormatException) { throw Error("사진 데이터를 확인해 주세요."); }
        if (bytes.Length == 0 || bytes.Length > limit) throw Error("사진 크기를 확인해 주세요.");
        return bytes;
    }
}
