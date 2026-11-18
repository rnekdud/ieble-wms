using IebleWms.Api.Data;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Reports;
internal static class DashboardQueries
{
    internal static IQueryable<InboundReceipt> OpenReceipts(WmsDbContext db, Guid tenant) =>
        db.InboundReceipts.AsNoTracking().Where(x => x.TenantId == tenant && (x.Status == "Planned" || x.Status == "Inspecting"));
    internal static IQueryable<OutboundShipment> OpenShipments(WmsDbContext db, Guid tenant) =>
        db.OutboundShipments.AsNoTracking().Where(x => x.TenantId == tenant && (x.Status == "Requested" || x.Status == "Picking" || x.Status == "Picked" || x.Status == "Inspected"));
}
