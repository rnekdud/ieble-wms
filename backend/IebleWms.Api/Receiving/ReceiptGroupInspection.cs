using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Products;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Receiving;

public sealed partial class ReceiptService
{
    sealed record GroupCount(Guid LineId, decimal? Quantity);
    sealed record GroupSnapshot(GroupCount[] Counts);

    ReceiptChange ChangeGroupQuantity(InboundReceipt doc, Guid actor, InboundReceiptLine[] lines, decimal quantity, string action, string reason, Guid requestId, string hash, string? barcode = null, GroupCount[]? restore = null)
    {
        var previous = lines.Sum(l => l.InspectedQuantity ?? 0);
        var before = new GroupSnapshot(lines.Select(l => new GroupCount(l.Id, l.InspectedQuantity)).ToArray());
        if (restore != null)
        {
            foreach (var l in lines) l.InspectedQuantity = restore.Single(x => x.LineId == l.Id).Quantity;
        }
        else
        {
            var delta = quantity - previous;
            // Preserve counts on existing rows; only distribute the increment/reduction. Tracking remains separate.
            foreach (var l in delta >= 0 ? lines : lines.Reverse())
            {
                var current = l.InspectedQuantity ?? 0;
                var change = delta >= 0 ? Math.Min(delta, l.ExpectedQuantity - current) : -Math.Min(-delta, current);
                l.InspectedQuantity = current + change; delta -= change;
            }
            if (delta != 0) throw Error("상품의 검수 수량과 원본 입고 행을 확인해 주세요.");
        }
        foreach (var l in lines) l.Placements = [];
        var changeRecord = AddChange(doc, actor, action, before, new GroupSnapshot(lines.Select(l => new GroupCount(l.Id, l.InspectedQuantity)).ToArray()));
        changeRecord.ScanRequestId = requestId; changeRecord.ScanRequestHash = hash; changeRecord.LineId = lines[0].Id;
        changeRecord.PreviousQuantity = previous; changeRecord.Quantity = quantity; changeRecord.Barcode = barcode; changeRecord.Reason = reason;
        return changeRecord;
    }

    async Task<ReceiptChange> CorrectGroupQuantity(InboundReceipt doc, Guid actor, InboundReceiptLine[] lines, ReceiptQuantityRequest r, string hash, CancellationToken ct)
    {
        decimal quantity;
        GroupCount[]? restore = null;
        var action = "QuantityCorrected";
        if (r.UndoScanRequestId.HasValue)
        {
            if (r.Quantity.HasValue) throw Error("되돌리기에는 수량을 함께 지정할 수 없습니다.");
            var scan = await db.ReceiptChanges.SingleOrDefaultAsync(x => x.TenantId == doc.TenantId && x.ReceiptId == doc.Id && x.ScanRequestId == r.UndoScanRequestId && x.LineId == lines[0].Id && x.Action == "BarcodeScanned", ct) ?? throw Error("되돌릴 상품 스캔 기록이 없습니다.");
            var ids = lines.Select(l => l.Id).ToArray();
            var before = JsonSerializer.Deserialize<GroupSnapshot>(scan.BeforeJson);
            var after = JsonSerializer.Deserialize<GroupSnapshot>(scan.AfterJson);
            if (before?.Counts == null || after?.Counts == null || !before.Counts.Select(c => c.LineId).Order().SequenceEqual(ids.Order()) || after.Counts.Any(c => lines.Single(l => l.Id == c.LineId).InspectedQuantity != c.Quantity) || await db.ReceiptChanges.AnyAsync(x => x.TenantId == doc.TenantId && x.ReceiptId == doc.Id && x.Id > scan.Id && (ids.Contains(x.LineId ?? Guid.Empty) || x.Action == "Inspected" || x.Action == "Updated" || x.Action == "TrackingUpdated"), ct))
                throw Error("이후 검수 변경이 있어 이 스캔을 되돌릴 수 없습니다. 수량 수정 기능을 사용해 주세요.", 409);
            restore = before.Counts; quantity = scan.PreviousQuantity ?? 0; action = "ScanUndone";
        }
        else quantity = r.Quantity ?? throw Error("검수 수량을 입력해 주세요.");
        Quantity(quantity, true); ProductPackaging.ValidateEach(quantity, lines[0].Unit);
        if (lines.Any(l => l.Unit != lines[0].Unit)) throw Error("동일 상품의 원본 단위가 서로 다릅니다. 입고 내역을 확인해 주세요.");
        if (quantity > lines.Sum(l => l.ExpectedQuantity)) throw Error("예정 수량을 초과했습니다.");
        return ChangeGroupQuantity(doc, actor, lines, quantity, action, r.Reason.Trim(), r.RequestId, hash, restore: restore);
    }
}
