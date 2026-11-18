using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Receiving;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Shipping;

public sealed partial class ShipmentService
{
    public async Task<object> Scan(Guid tenant, Guid actor, Guid id, ShipmentScanRequest r, bool inspect, CancellationToken ct)
    {
        // Serialize against manual work, confirmation, cancellation and other inventory writes.
        await using var tx = await Begin(tenant, ct);
        var doc = await Find(tenant, id, ct);
        var lines = await Lines(tenant, id, ct);
        var allocations = await Allocations(tenant, lines, ct);
        if (r.RequestId == Guid.Empty) throw Error("스캔 요청 번호를 확인해 주세요.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { id, inspect, r }))));
        var replay = await db.ShipmentChanges.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenant && x.ScanRequestId == r.RequestId, ct);
        async Task<object> Result(string outcome, Guid? allocationId = null, Guid[]? candidates = null, Guid? locationId = null, string? locationCode = null, bool replayed = false)
        {
            var detail = await Detail(tenant, id, ct);
            await tx.CommitAsync(ct);
            return new { outcome, detail, allocationId, candidateAllocationIds = candidates ?? [], locationId, locationCode, requestId = r.RequestId, replayed };
        }
        if (replay != null)
        {
            if (replay.ActorId != actor || replay.ShipmentId != id || replay.ScanRequestHash != hash) throw Error("이미 사용한 요청 번호의 내용이 다릅니다.", 409);
            return await Result("applied", replay.AllocationId, replayed: true);
        }
        State(doc, inspect ? "Picked" : "Picking");
        var label = await BarcodeRegistry.Find(db, tenant, r.Barcode, ct) ?? throw Error("등록되지 않은 바코드입니다.", 404);
        var stocks = await LoadStocks(tenant, allocations, ct);
        await CaptureSourceLocations(tenant, doc, allocations, stocks, ct);
        if (label.LocationId is Guid scannedLocation)
        {
            var location = await ActiveLocations(tenant, doc.WarehouseId).SingleOrDefaultAsync(x => x.Id == scannedLocation, ct)
                ?? throw Error("현재 출고 창고의 사용 가능한 보관 위치가 아닙니다.");
            if (!allocations.Any(a => a.State == "Active" && stocks[a.StockId].LocationId == scannedLocation)) throw Error("현재 출고 문서에 예약된 위치가 아닙니다.");
            return await Result("location", locationId: scannedLocation, locationCode: location.Code);
        }
        if (label.ProductId is not Guid productId) throw Error("상품 또는 보관 위치 바코드를 스캔하세요. 랙 바코드는 피킹 위치를 특정할 수 없습니다.");
        var productLines = lines.Where(l => l.ProductId == productId).Select(l => l.Id).ToHashSet();
        if (productLines.Count == 0) throw Error("현재 출고 문서에 포함되지 않은 상품입니다.");
        if (!await db.Products.AnyAsync(p => p.TenantId == tenant && p.Id == productId && p.IsActive, ct)) throw Error("사용 중지된 상품입니다.");
        var matches = allocations.Where(a => a.State == "Active" && productLines.Contains(a.LineId) && (!r.LocationId.HasValue || stocks[a.StockId].LocationId == r.LocationId)).ToArray();
        if (matches.Length == 0) throw Error("선택한 위치에 예약된 상품이 아닙니다.");
        // Never distribute to another location/LOT/serial, even when the first row is full.
        var selected = r.AllocationId.HasValue ? matches.SingleOrDefault(a => a.Id == r.AllocationId) : matches.Length == 1 ? matches[0] : null;
        if (r.AllocationId.HasValue && selected == null) throw Error("선택한 예약 행의 상품·위치가 스캔 내용과 다릅니다.");
        if (selected == null) return await Result("select-allocation", candidates: matches.Select(a => a.Id).ToArray());
        var line = lines.Single(l => l.Id == selected.LineId);
        var stock = stocks[selected.StockId];
        var activeLocation = await ActiveLocations(tenant, doc.WarehouseId).SingleOrDefaultAsync(l => l.Id == stock.LocationId, ct);
        if (activeLocation == null || activeLocation.Code != selected.LocationCode || stock.WarehouseId != doc.WarehouseId || stock.ProductId != productId || stock.Unit != line.Unit || stock.LotNumber != selected.LotNumber || stock.ExpiryDate != selected.ExpiryDate || stock.SerialNumber != selected.SerialNumber || stock.ReservedQuantity < allocations.Where(a => a.StockId == stock.Id).Sum(a => a.Quantity) || stock.Quantity < stock.ReservedQuantity)
            throw Error("예약 재고의 위치·LOT·시리얼 또는 수량이 변경되었습니다. 예약 정보를 확인하세요.", 409);
        if (inspect && selected.PickedQuantity <= 0) throw Error("피킹되지 않은 상품은 검수할 수 없습니다.");
        if (!ReceiptService.CanCountScan(line.Unit)) return await Result("manual", selected.Id);
        line.BarcodeSnapshotJson ??= await IebleWms.Api.Products.ProductPackaging.Capture(db,tenant,await db.Products.SingleAsync(p=>p.TenantId==tenant&&p.Id==productId,ct),ct);
        var increment=IebleWms.Api.Products.ProductPackaging.ScanFactor(line.BarcodeSnapshotJson,label,line.Unit);
        var previous = inspect ? selected.InspectedQuantity : selected.PickedQuantity;
        if (previous + increment > (inspect ? selected.PickedQuantity : selected.Quantity)) return await Result("over-limit", selected.Id);
        var before = Snapshot(doc, lines, allocations);
        if (inspect) { selected.InspectedQuantity += increment; selected.InspectedAt = clock.GetUtcNow(); selected.InspectedByUserId = actor; }
        else { selected.PickedQuantity += increment; selected.PickedAt = clock.GetUtcNow(); selected.PickedByUserId = actor; }
        var change = Audit(doc, actor, inspect ? "InspectionScanned" : "PickingScanned", before, lines, allocations);
        change.ScanRequestId = r.RequestId; change.ScanRequestHash = hash; change.AllocationId = selected.Id;
        change.Barcode = r.Barcode; change.PreviousQuantity = previous; change.Quantity = previous + increment;
        await Save(ct);
        return await Result("applied", selected.Id);
    }
}
