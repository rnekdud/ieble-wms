using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Receiving;

public sealed partial class ReceiptService
{
    // Allocations are children of the ORIGINAL line. No line, scan or placement identifier is replaced.
    public async Task<object> SaveTracking(Guid tenant, Guid actor, Guid id, ReceiptTrackingRequest request, CancellationToken ct)
    {
        await using var tx = await Begin(tenant, ct);
        var doc = await Find(tenant, id, ct);
        Version(doc, request.Version); State(doc, "Inspecting");
        if (doc.InspectedAt != null) throw Error("검수가 확정되어 LOT·시리얼을 변경할 수 없습니다.", 409);
        var lines = await Lines(tenant, id, ct);
        var selected = lines.Where(l => l.ProductId == request.ProductId).ToList();
        if (selected.Count == 0) throw Error("현재 입고 문서의 상품을 선택해 주세요.");
        Match(selected, request.Lines.Select(l => l.LineId));
        var before = Snapshot(doc, lines);
        foreach (var input in request.Lines)
        {
            var line = selected.Single(l => l.Id == input.LineId);
            line.TrackingAllocations = input.Allocations;
            ValidateTrackingAllocations(line, line.InspectedQuantity ?? 0);
            line.Placements = [];
        }
        await ValidateTrackingSerials(tenant, lines, ct);
        Audit(doc, actor, "TrackingUpdated", before, lines);
        await Save(ct); await tx.CommitAsync(ct);
        return new { receipt = doc, lines };
    }

    static void ValidateTrackingAllocations(InboundReceiptLine line, decimal quantity, string quantityLabel = "검수수량")
    {
        var allocations = line.TrackingAllocations!;
        if (allocations.Length > 100 || allocations.Any(a => a == null || a.Id == Guid.Empty) || allocations.Select(a => a.Id).Distinct().Count() != allocations.Length)
            throw Error("LOT·시리얼 구분과 등록 개수(최대 100개)를 확인해 주세요.");
        ProductPackaging.ValidateEach(quantity, line.Unit);
        foreach (var a in allocations)
        {
            Quantity(a.Quantity, false); ProductPackaging.ValidateEach(a.Quantity, line.Unit);
            a.LotNumber = string.IsNullOrWhiteSpace(a.LotNumber) ? null : a.LotNumber.Trim();
            if (a.LotNumber?.Length > 100 || a.LotNumber?.Any(char.IsControl) == true || a.ExpiryDate == default(DateOnly))
                throw Error("LOT 번호·유통기한 형식을 확인해 주세요.");
            if (a.Serials == null || a.Serials.Length > 1000) throw Error("시리얼은 추적 항목당 최대 1,000개입니다.");
            a.Serials = a.Serials.Select(s => s?.Trim() ?? "").ToArray();
            if (a.Serials.Any(s => s.Length is < 1 or > 100 || s.Any(char.IsControl)) || a.Serials.Distinct().Count() != a.Serials.Length)
                throw Error("시리얼 번호의 공백·형식·중복을 확인해 주세요.");
            // Existing receipt tracking is optional. A serial identifies ONE EA; untracked remainder is explicit.
            if (a.Serials.Length > 0 && (decimal.Truncate(a.Quantity) != a.Quantity || a.Serials.Length > a.Quantity))
                throw Error("시리얼 개수는 해당 LOT의 정수 수량을 초과할 수 없습니다.");
        }
        var difference = allocations.Sum(a => a.Quantity) - quantity;
        if (difference > 0) throw Error($"{line.ProductName}: LOT·시리얼 할당 수량이 {quantityLabel}보다 {difference:0.###}개 초과합니다.");
        var serials = allocations.SelectMany(a => a.Serials).ToArray();
        if (serials.Length > 1000 || serials.Distinct().Count() != serials.Length) throw Error("동일 상품의 시리얼 중복 또는 등록 개수를 확인해 주세요.");
        line.TrackingAllocations = allocations;
        line.Serials = serials;
        line.LotNumber = allocations.Length == 1 ? allocations[0].LotNumber : null;
        line.ExpiryDate = allocations.Length == 1 ? allocations[0].ExpiryDate : null;
        line.LotManaged = allocations.Any(a => a.LotNumber != null);
        line.ExpiryManaged = allocations.Any(a => a.ExpiryDate != null);
        line.SerialManaged = serials.Length > 0;
    }

    async Task ValidateTrackingSerials(Guid tenant, List<InboundReceiptLine> lines, CancellationToken ct)
    {
        UniqueSerials(lines);
        foreach (var group in lines.GroupBy(l => l.ProductId))
        {
            var serials = group.SelectMany(l => l.Serials).ToArray();
            if (serials.Length > 0 && await db.StockBalances.AnyAsync(s => s.TenantId == tenant && s.ProductId == group.Key && s.SerialNumber != null && serials.Contains(s.SerialNumber), ct))
                throw Error("이미 입고된 상품 시리얼 번호가 있습니다.", 409);
            // A named LOT cannot silently acquire two different expiry dates within this receipt.
            var lots = group.SelectMany(l => l.TrackingAllocations ?? [new() { LotNumber = l.LotNumber, ExpiryDate = l.ExpiryDate }]);
            if (lots.Where(a => a.LotNumber != null).GroupBy(a => a.LotNumber).Any(g => g.Select(a => a.ExpiryDate).Distinct().Count() > 1))
                throw Error("동일 LOT 번호의 유통기한이 서로 다릅니다. LOT·유통기한을 확인해 주세요.");
        }
    }

    static void ValidateAllocatedPlacements(InboundReceiptLine line)
    {
        var allocations = line.TrackingAllocations!;
        foreach (var p in line.Placements)
        {
            var allocation = allocations.SingleOrDefault(a => a.Id == p.TrackingId);
            if (p.TrackingId != null && allocation == null) throw Error("해당 입고 행의 LOT·시리얼 배치를 선택해 주세요.");
            if (p.Serials.Length > p.Quantity) throw Error("배치 시리얼 개수는 배치 수량을 초과할 수 없습니다.");
            if (p.Serials.Except(allocation?.Serials ?? []).Any()) throw Error("시리얼과 LOT의 연결이 일치하지 않습니다.");
        }
        foreach (var allocation in allocations)
        {
            var placements = line.Placements.Where(p => p.TrackingId == allocation.Id).ToArray();
            if (placements.Sum(p => p.Quantity) != allocation.Quantity) throw Error($"{line.ProductName}: LOT {allocation.LotNumber ?? "미지정"}의 배치 수량을 확인해 주세요.");
            if (!placements.SelectMany(p => p.Serials).Order().SequenceEqual(allocation.Serials.Order())) throw Error("LOT별 시리얼을 위치에 한 번씩 배치해 주세요.");
        }
        var remainder = (line.InspectedQuantity ?? 0) - allocations.Sum(a => a.Quantity);
        if (line.Placements.Where(p => p.TrackingId == null).Sum(p => p.Quantity) != remainder) throw Error("LOT 미할당 수량의 위치 배치를 확인해 주세요.");
    }
}
