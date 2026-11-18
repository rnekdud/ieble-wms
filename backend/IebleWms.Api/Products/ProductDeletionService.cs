using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Products;

public sealed record ProductDeletionItem(Guid Id, string Code, string Name, Guid Version, string[] Reasons)
{
    public bool CanDelete => Reasons.Length == 0;
}
public sealed record ProductDeletionReview(ProductDeletionItem[] Items)
{
    public bool CanDelete => Items.All(x => x.CanDelete);
}
public sealed partial class ProductService
{
    static Guid[] DeletionIds(ProductDeleteRequest request)
    {
        if (request.Items is null || request.Items.Any(x => x is null)) throw Error(400, "삭제할 상품을 확인해 주세요.");
        var ids = request.Items.Select(x => x.Id).ToArray();
        if (ids.Length is < 1 or > 100 || ids.Contains(Guid.Empty) || ids.Distinct().Count() != ids.Length)
            throw Error(400, "삭제할 상품을 1~100개 선택해 주세요. 중복 선택은 허용되지 않습니다.");
        return ids;
    }
    public async Task<ProductDeletionReview> ReviewDeletion(Guid tenant, ProductDeleteRequest request, CancellationToken ct)
    {
        var ids = DeletionIds(request);
        var products = await db.Products.AsNoTracking().Where(x => x.TenantId == tenant && ids.Contains(x.Id)).ToListAsync(ct);
        // Do not reveal whether missing IDs belong to a different tenant.
        if (products.Count != ids.Length) throw Error(404, "선택한 상품을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
        var stocks = await db.StockBalances.AsNoTracking().Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).Select(x => new { x.ProductId, x.Quantity, x.ReservedQuantity }).ToListAsync(ct);
        var receipts = await db.InboundReceiptLines.Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).Select(x => x.ProductId).Distinct().ToListAsync(ct);
        var shipments = await db.OutboundShipmentLines.Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).Select(x => x.ProductId).Distinct().ToListAsync(ct);
        var operations = await db.InventoryOperations.Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).Select(x => x.ProductId).Distinct().ToListAsync(ct);
        var counts = await db.StocktakeTargets.Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).Select(x => x.ProductId).Distinct().ToListAsync(ct);
        return new(products.OrderBy(x => x.Code).Select(p => {
            var reasons = new List<string>();
            if (stocks.Any(x => x.ProductId == p.Id && x.Quantity != 0)) reasons.Add("현재 재고 존재");
            if (stocks.Any(x => x.ProductId == p.Id && x.ReservedQuantity != 0)) reasons.Add("출고 예약 존재");
            if (receipts.Contains(p.Id)) reasons.Add("입고 문서·이력 존재");
            if (shipments.Contains(p.Id)) reasons.Add("출고 문서·이력 존재");
            if (operations.Contains(p.Id)) reasons.Add("재고 이동·조정 이력 존재");
            if (counts.Contains(p.Id)) reasons.Add("재고 실사 이력 존재");
            // Even a zero balance is a retained reference; movements/allocations reference that balance.
            if (stocks.Any(x => x.ProductId == p.Id)) reasons.Add("재고·변동 이력 참조 존재");
            if (p.TrackingLockedAt.HasValue && reasons.Count == 0) reasons.Add("과거 업무 사용 이력 존재");
            if (request.Items.Single(x => x.Id == p.Id).Version != p.Version) reasons.Add("상품 정보 변경됨 — 목록을 새로고침해 주세요");
            return new ProductDeletionItem(p.Id, p.Code, p.Name, p.Version, reasons.ToArray());
        }).ToArray());
    }
    public async Task<object> DeleteProducts(Guid tenant, Guid actor, ProductDeleteRequest request, CancellationToken ct)
    {
        await using var tx = await Begin(tenant, ct);
        // The same tenant lock is used by product and business-reference writers. Recheck after acquiring it.
        var review = await ReviewDeletion(tenant, request, ct);
        if (!review.CanDelete)
            throw Error(409, string.Join("\n", review.Items.Where(x => !x.CanDelete).Select(x => $"{x.Name}: {string.Join(", ", x.Reasons)}")) + "\n전체 삭제를 중단했습니다. 사용 중지 기능을 이용해 주세요.");
        var ids = review.Items.Select(x => x.Id).ToArray();
        var products = await db.Products.Where(x => x.TenantId == tenant && ids.Contains(x.Id)).ToListAsync(ct);
        // Images are database blobs. Only the selected products' image and barcode rows are removed.
        db.ProductImages.RemoveRange(await db.ProductImages.Where(x => x.TenantId == tenant && ids.Contains(x.ProductId)).ToListAsync(ct));
        db.StorageBarcodes.RemoveRange(await db.StorageBarcodes.Where(x => x.TenantId == tenant && x.ProductId.HasValue && ids.Contains(x.ProductId.Value)).ToListAsync(ct));
        foreach (var p in products) Audit(tenant, actor, p.Id, "ProductDeleted", Snapshot(p), new { deleted = true });
        db.AllowUnusedProductDeletion(ids);
        db.Products.RemoveRange(products);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { throw Error(409, "다른 작업에서 상품을 변경하거나 참조했습니다. 전체 삭제를 중단했습니다. 목록을 새로고침해 주세요."); }
        await tx.CommitAsync(ct);
        return new { deletedCount = ids.Length };
    }
}
