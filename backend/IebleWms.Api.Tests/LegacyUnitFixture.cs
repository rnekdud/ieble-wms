using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
namespace IebleWms.Api.Tests;
// Test-only representation of an existing legacy product. New API products must remain EA.
internal static class LegacyUnitFixture
{
 public static async Task Set(IServiceProvider services, Guid id, string unit)
 {
  using var scope=services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WmsDbContext>();
  var product=await db.Products.SingleAsync(x=>x.Id==id);product.Unit=unit;await db.SaveChangesAsync();
 }
}
