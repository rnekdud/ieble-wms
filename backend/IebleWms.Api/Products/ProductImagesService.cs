using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Support;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;

public sealed partial class ProductService
{
    public async Task<ProductImage> Image(Guid tenant, Guid product, CancellationToken ct, Guid? imageId = null) =>
        await db.ProductImages.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.ProductId == product &&
            (imageId.HasValue ? x.Id == imageId : x.IsPrimary), ct) ?? throw Error(404, "상품 이미지가 없습니다.");

    Task<List<ProductImageInfo>> ImageMetadata(Guid tenant, Guid product, CancellationToken ct) =>
        db.ProductImages.AsNoTracking().Where(x => x.TenantId == tenant && x.ProductId == product)
            .OrderBy(x => x.Position).ThenBy(x => x.Id)
            .Select(x => new ProductImageInfo(x.Id, x.FileName, x.ContentType, x.IsPrimary, x.Position, x.CreatedAt)).ToListAsync(ct);

    async Task SaveImages(Product p, ProductRequest r, Guid actor, CancellationToken ct)
    {
        if (r.Images == null && r.Image == null) return;
        if (r.Images != null && r.Image != null) throw Error(400, "이미지 저장 방식을 하나만 사용해 주세요.");
        var old = await db.ProductImages.Where(x => x.TenantId == p.TenantId && x.ProductId == p.Id).OrderBy(x => x.Position).ToListAsync(ct);
        var before = old.Select(Metadata).ToArray();
        var requests = r.Images;
        // Preserve legacy clients: replacing/removing the primary never discards additional images.
        if (requests == null) {
            var primary = old.FirstOrDefault(x => x.IsPrimary);
            var retained = old.Where(x => x.Id != primary?.Id).Select(x => new ProductGalleryImageRequest { Id = x.Id }).ToList();
            if (!r.Image!.Remove) retained.Insert(0, new() { FileName = r.Image.FileName, Base64 = r.Image.Base64, IsPrimary = true });
            requests = retained.ToArray();
        }
        if (requests.Length > 8 || requests.Count(x => x.IsPrimary) > 1) throw Error(400, "상품 이미지는 최대 8장, 대표 이미지는 1장입니다.");
        var result = new List<ProductImage>(); var ids = new HashSet<Guid>();
        foreach (var item in requests) {
            if (item.Id.HasValue) {
                var existing = old.SingleOrDefault(x => x.Id == item.Id) ?? throw Error(400, "이 상품에 속한 이미지를 선택해 주세요.");
                if (!ids.Add(existing.Id) || item.Base64 != null) throw Error(400, "중복 이미지 또는 잘못된 이미지 변경 요청입니다.");
                result.Add(existing);
            } else {
                byte[] bytes;
                try { bytes = Convert.FromBase64String(item.Base64 ?? ""); } catch (FormatException) { throw Error(400, "이미지 데이터를 확인해 주세요."); }
                if (bytes.Length is < 1 or > 2 * 1024 * 1024) throw Error(400, "상품 이미지는 2MB 이하 PNG·JPG를 선택해 주세요.");
                var name = item.FileName ?? "";
                if (Path.GetExtension(name).ToLowerInvariant() is not (".png" or ".jpg" or ".jpeg")) throw Error(400, "상품 이미지는 PNG·JPG만 지원합니다.");
                using var stream = new MemoryStream(bytes);
                var validated = (await SupportFiles.Read([new FormFile(stream, 0, bytes.Length, "image", name)], ct))[0];
                if (item.ContentType != null && item.ContentType != validated.ContentType) throw Error(400, "이미지 형식과 MIME 유형이 일치하지 않습니다.");
                result.Add(new() { TenantId = p.TenantId, ProductId = p.Id, FileName = validated.FileName, ContentType = validated.ContentType, Content = validated.Content, CreatedAt = clock.GetUtcNow() });
            }
        }
        // Validate the entire request before changing saved images. The caller owns the transaction.
        db.ProductImages.RemoveRange(old.Where(x => !ids.Contains(x.Id)));
        foreach (var item in old) item.IsPrimary = false;
        if (old.Count > 0) await Save(ct); // Release the primary unique key before assigning another image.
        var primaryIndex = Array.FindIndex(requests, x => x.IsPrimary);
        if (primaryIndex < 0) primaryIndex = 0;
        for (var i = 0; i < result.Count; i++) {
            result[i].Position = i; result[i].IsPrimary = i == primaryIndex;
            if (!ids.Contains(result[i].Id)) db.ProductImages.Add(result[i]);
        }
        p.HasImage = result.Count > 0;
        Audit(p.TenantId, actor, p.Id, "ProductImagesChanged", before, result.Select(Metadata).ToArray());
    }
    static ProductImageInfo Metadata(ProductImage x) => new(x.Id, x.FileName, x.ContentType, x.IsPrimary, x.Position, x.CreatedAt);
}
