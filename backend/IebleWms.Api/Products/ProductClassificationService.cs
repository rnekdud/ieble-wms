using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Products;

public sealed partial class ProductService
{
    async Task<List<ProductCategory>> CategoryOptions(Guid tenant, CancellationToken ct)
    {
        var own = await db.ProductCategories.AsNoTracking().Where(x => x.TenantId == tenant).OrderBy(x => x.Name).ToListAsync(ct);
        return DefaultProductClassification.CategoryRows(tenant).Where(x => !own.Any(c => c.Id == x.Id)).Concat(own).ToList();
    }
    public async Task<object> Options(Guid tenant, CancellationToken ct)
    {
        var own = await db.ProductTypes.AsNoTracking().Where(x => x.TenantId == tenant).OrderBy(x => x.Name).ToListAsync(ct);
        return new { units = ProductUnits.Codes, categories = await CategoryOptions(tenant, ct),
            productTypes = DefaultProductClassification.TypeRows(tenant).Where(x => !own.Any(c => c.Id == x.Id)).Concat(own).ToList() };
    }
    // Read-only options never seed a tenant. Materialize only selected defaults under the existing write lock.
    // IDs are deterministic per tenant, so existing composite foreign keys and uniqueness prevent duplication.
    async Task MaterializeClassification(Guid tenant, Guid actor, Guid? categoryId, Guid? typeId, CancellationToken ct)
    {
        var defaults = DefaultProductClassification.CategoryRows(tenant).ToDictionary(x => x.Id);
        var pending = new List<ProductCategory>();
        while (categoryId.HasValue && defaults.TryGetValue(categoryId.Value, out var c))
        {
            if (!await db.ProductCategories.AnyAsync(x => x.TenantId == tenant && x.Id == c.Id, ct)) pending.Add(c);
            categoryId = c.ParentId;
        }
        foreach (var c in pending.AsEnumerable().Reverse())
        {
            db.ProductCategories.Add(c);
            Audit(tenant, actor, c.Id, "SystemCategoryMaterialized", new { }, new { c.Name, c.ParentId });
        }
        var type = DefaultProductClassification.TypeRows(tenant).SingleOrDefault(x => x.Id == typeId);
        if (type != null && !await db.ProductTypes.AnyAsync(x => x.TenantId == tenant && x.Id == type.Id, ct))
        {
            db.ProductTypes.Add(type);
            Audit(tenant, actor, type.Id, "SystemProductTypeMaterialized", new { }, new { type.Name });
        }
        if (pending.Count > 0 || db.ChangeTracker.Entries<ProductType>().Any(x => x.State == EntityState.Added)) await Save(ct);
    }
}
