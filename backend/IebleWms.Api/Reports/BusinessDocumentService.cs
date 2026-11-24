using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using IebleWms.Api.Receiving;
using IebleWms.Api.Shipping;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Reports;

public sealed class BusinessDocumentService(WmsDbContext db, ReceiptService receipts, ShipmentService shipments, TimeProvider clock)
{
    static DocumentColumn C(string title, int width) => new(title, width);
    static DocumentTable Table(string title, params DocumentColumn[] columns) => new(title, columns, []);
    static string State(string state) => state switch { "Planned" => "입고 예정", "Inspecting" => "검수 진행", "Requested" => "출고 지시", "Picking" => "피킹 진행", "Picked" => "피킹 완료", "Inspected" => "최종 검수 완료", "Confirmed" => "확정", "Cancelled" => "취소", _ => state };
    static DateOnly? Day(DateTimeOffset? date) => date is { } d ? DateOnly.FromDateTime(d.ToOffset(TimeSpan.FromHours(9)).DateTime) : null;
    static decimal? KnownSum(IEnumerable<decimal?> values) { var list = values.ToArray(); return list.Any(x => x.HasValue) ? list.Sum(x => x ?? 0) : null; }
    static decimal? CompleteSum(IEnumerable<decimal?> values) { var list = values.ToArray(); return list.Length > 0 && list.All(x => x.HasValue) ? list.Sum(x => x!.Value) : null; }
    async Task<string?> Actor(Guid tenant, Guid? id, CancellationToken ct) => id == null ? null : await db.TenantMemberships.Where(x => x.TenantId == tenant && x.UserId == id).Select(x => x.User.DisplayName).FirstOrDefaultAsync(ct);
    async Task<BusinessDocument> Create(Guid tenant, string kind, string title, string number, CancellationToken ct)
        => new(kind, title, number, clock.GetUtcNow().ToOffset(TimeSpan.FromHours(9)), await db.Tenants.AsNoTracking().Where(x => x.Id == tenant).Select(x => x.Name).SingleAsync(ct), [], [], []);
    static string? Tracking(BusinessDocumentLanguage words, string? lot, DateOnly? expiry, IEnumerable<string> serials)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(lot)) parts.Add(words.Text("LOT") + ": " + lot);
        if (expiry != null) parts.Add(words.Text("유통기한") + ": " + BusinessDocument.Text(expiry));
        if (serials.Any()) parts.Add(words.Text("시리얼") + ": " + string.Join(", ", serials));
        return parts.Count > 0 ? string.Join("    ", parts) : null;
    }
    public async Task<BusinessDocument> Receipt(Guid tenant, Guid id, string kind, CancellationToken ct, string language = "ko")
    {
        if (kind is not ("statement" or "inspection")) throw new OrganizationException(400, "지원하지 않는 서류입니다.");
        var (r, lines) = await receipts.DocumentSource(tenant, id, ct);
        bool inspection = kind == "inspection", confirmed = r.Status == "Confirmed";
        var doc = (await Create(tenant, inspection ? "입고검수표" : "입고명세서", inspection ? "입고 검수표" : "입고 명세서", r.Number, ct)) with { Language = BusinessDocumentLanguage.Normalize(language) };
        var words = doc.Words;
        var inspectionState = r.Status == "Cancelled" ? "취소" : r.InspectedAt != null ? "검수 완료" : lines.Any(l => l.InspectedQuantity.HasValue) ? "검수 중" : "미검수";
        doc.Information.AddRange([("작성일", Day(r.CreatedAt)), ("입고 예정일", r.ExpectedDate), ("실제 입고일", Day(r.ConfirmedAt)), ("거래처", r.PartnerName), ("창고", r.WarehouseName), ("입고 상태", words.Text(State(r.Status))), ("담당자", r.ContactName), ("검수일", Day(r.InspectedAt)), ("검수 담당자", await Actor(tenant, r.InspectedByUserId, ct)), ("검수 상태", words.Text(inspectionState)), ("비고", r.Notes), ("총 품목 수", lines.Select(x => x.ProductId).Distinct().Count())]);
        var main = inspection
            ? Table("검수 내역", C("번호",4), C("품명 / 규격",21), C("단위",5), C("예정수량",8), C("검수수량",8), C("차이",6), C("검수결과",8))
            : Table("입고 내역", C("번호",4), C("상품코드",10), C("품명 / 규격",23), C("단위",5), C("예정수량",9), C("입고수량",9));
        foreach (var l in lines) {
            // There is no stored pass/fail field. Show the persisted inspection lifecycle,
            // never infer a quality verdict from a matching quantity.
            var result = l.InspectedQuantity == null ? "미검수" : r.InspectedAt == null ? "검수 중" : "검수 완료";
            main.Rows.Add(inspection
                ? [l.Position + 1, l.ProductName, l.Unit, l.ExpectedQuantity, l.InspectedQuantity, l.InspectedQuantity - l.ExpectedQuantity, words.Text(result)]
                : [l.Position + 1, l.ProductCode, l.ProductName, l.Unit, l.ExpectedQuantity, confirmed ? l.InspectedQuantity : null]);
        }
        doc.Tables.Add(main);
        // Tracking rows have their own quantities, and never feed the line totals.
        var tracking = inspection
            ? Table("LOT·유통기한 상세", C("품목번호",6), C("상품코드",12), C("LOT",17), C("유통기한",11), C("검수수량",9), C("단위",5))
            : Table("LOT·유통기한 상세", C("품목번호",6), C("상품코드",14), C("LOT",24), C("유통기한",16));
        foreach (var l in lines) {
            void Add(string? lot, DateOnly? expiry, decimal? quantity, string[] serials) {
                tracking.Rows.Add(inspection ? [l.Position + 1, l.ProductCode, lot, expiry, quantity, l.Unit] : [l.Position + 1, l.ProductCode, lot, expiry]);
                if (serials.Length > 0) tracking.Details[tracking.Rows.Count - 1] = words.Text("시리얼") + ": " + string.Join(", ", serials);
            }
            if (l.TrackingAllocations is { Length: > 0 } allocations) foreach (var a in allocations) Add(a.LotNumber, a.ExpiryDate, l.InspectedQuantity == null ? null : a.Quantity, a.Serials);
            else if (Tracking(words, l.LotNumber, l.ExpiryDate, l.Serials) != null) Add(l.LotNumber, l.ExpiryDate, l.InspectedQuantity, l.Serials);
        }
        if (tracking.Rows.Count > 0) doc.Tables.Add(tracking);
        var totals = inspection
            ? Table("합계", C("단위",6), C("총 예정수량",15), C("총 검수수량",15), C("총 차이수량",13), C("미검수 품목",11))
            : Table("합계", C("단위",10), C("총 예정수량",25), C("총 입고수량",25));
        foreach (var g in lines.GroupBy(x => x.Unit)) totals.Rows.Add(inspection
            ? [g.Key, g.Sum(x => x.ExpectedQuantity), KnownSum(g.Select(x => x.InspectedQuantity)), CompleteSum(g.Select(x => x.InspectedQuantity - x.ExpectedQuantity)), g.Count(x => x.InspectedQuantity == null)]
            : [g.Key, g.Sum(x => x.ExpectedQuantity), confirmed ? CompleteSum(g.Select(x => x.InspectedQuantity)) : null]);
        doc.Tables.Add(totals);
        if (!confirmed && !inspection) doc.Notes.Add(words.Text("입고 미확정 · 입고수량 미확정"));
        if (inspection && lines.Any(l => !l.InspectedQuantity.HasValue)) doc.Notes.Add(words.Text("검수 미완료 · 검수 합계는 입력된 수량이며, 총 차이는 검수수량이 모두 입력된 후 표시합니다."));
        return doc;
    }
    public async Task<BusinessDocument> Shipment(Guid tenant, Guid id, string kind, CancellationToken ct, string language = "ko")
    {
        if (kind is not ("order" or "packing" or "picking")) throw new OrganizationException(400, "지원하지 않는 서류입니다.");
        var (s, lines, allocations) = await shipments.DocumentSource(tenant, id, ct);
        bool picking = kind == "picking", packing = kind == "packing", confirmed = s.Status == "Confirmed";
        var (name, title) = kind switch { "order" => ("출고지시서", "출고지시서"), "packing" => ("출고패킹리스트", "출고 패킹리스트"), _ => ("출고피킹리스트", "출고 피킹리스트") };
        var doc = (await Create(tenant, name, title, s.Number, ct)) with { Language = BusinessDocumentLanguage.Normalize(language) };
        var words = doc.Words;
        var active = allocations.Where(a => a.State != "Released").ToArray();
        var pickState = s.Status == "Cancelled" ? "취소" : s.PickedAt != null ? "피킹 완료" : active.Any(a => a.PickedAt != null || a.PickedQuantity != 0) || s.Status == "Picking" ? "피킹 진행" : "미피킹";
        doc.Information.AddRange([("작성일", Day(s.CreatedAt)), ("출고 지시일", s.RequestDate), ("출고 예정일", s.ExpectedDate), ("출고일", Day(s.ConfirmedAt)), ("거래처", s.PartnerName), ("창고", s.WarehouseName), ("출고지", string.Join(" ", new[]{s.ShippingPostalCode,s.ShippingAddress,s.ShippingAddressDetail}.Where(x => !string.IsNullOrWhiteSpace(x)))), ("담당자", s.ContactName), ("출고 상태", words.Text(State(s.Status))), ("작업 담당자", await Actor(tenant, s.PickedByUserId, ct)), ("피킹 상태", words.Text(pickState)), ("비고", s.Notes), ("총 품목 수", lines.Select(x => x.ProductId).Distinct().Count())]);
        decimal? Shipped(OutboundShipmentLine l) => confirmed ? KnownSum(active.Where(a => a.LineId == l.Id && a.State == "Consumed").Select(a => (decimal?)a.Quantity)) : null;
        decimal? Picked(ShipmentAllocation a) => a.PickedAt == null && a.PickedQuantity == 0 ? null : a.PickedQuantity;
        var main = picking
            ? Table("피킹 작업 내역", C("순서",4), C("보관위치",15), C("상품코드 / 품명",21), C("지시수량",8), C("피킹수량",8), C("확인",4))
            : packing
                ? Table(confirmed ? "출고 상품 내역" : "출고 예정 상품 내역", C("번호",4), C("상품코드",11), C("품명 / 규격",25), C("단위",5), C(confirmed ? "출고수량" : "지시수량",9), C("비고",6))
                : Table("출고 지시 내역", C("번호",4), C("상품코드",11), C("품명 / 규격",22), C("단위",5), C("지시수량",9), C("비고",9));
        if (picking) {
            // Preserve the detail reader's persisted location order; each allocation is a separate task.
            foreach (var a in active) {
                var l = lines.Single(x => x.Id == a.LineId);
                main.Rows.Add([main.Rows.Count + 1, string.Join(" / ",new[]{a.RackCode,a.LocationCode}.Where(x => !string.IsNullOrWhiteSpace(x))), l.ProductCode + "\n" + l.ProductName, a.Quantity, Picked(a), "□"]);
                main.Details[main.Rows.Count - 1] = words.Text("단위") + ": " + l.Unit + (Tracking(words, a.LotNumber, a.ExpiryDate, a.SerialNumber == null ? [] : [a.SerialNumber]) is { } tracking ? "    " + tracking : "");
            }
            foreach (var l in lines) {
                var allocated = active.Where(a => a.LineId == l.Id).Sum(a => a.Quantity);
                if (allocated >= l.RequestedQuantity) continue;
                main.Rows.Add([main.Rows.Count + 1, null, l.ProductCode + "\n" + l.ProductName, l.RequestedQuantity - allocated, null, "□"]);
                main.Details[main.Rows.Count - 1] = words.Text("단위") + ": " + l.Unit + "    " + words.Text("위치 미지정");
            }
        } else foreach (var l in lines) {
            main.Rows.Add([l.Position + 1, l.ProductCode, l.ProductName, l.Unit, packing && confirmed ? Shipped(l) : l.RequestedQuantity, null]);
            if (Tracking(words, l.LotNumber, l.ExpiryDate, l.Serials) is { } detail) main.Details[main.Rows.Count - 1] = detail;
        }
        doc.Tables.Add(main);
        var totals = picking
            ? Table("합계", C("단위",10), C("총 지시수량",25), C("실제 피킹수량",25))
            : Table("합계", C("단위",15), C(packing ? confirmed ? "총 출고수량" : "총 지시수량" : "총 출고 지시수량",45));
        foreach (var g in lines.GroupBy(x => x.Unit)) {
            var ids = g.Select(l => l.Id).ToHashSet();
            totals.Rows.Add(picking ? [g.Key, g.Sum(l => l.RequestedQuantity), KnownSum(active.Where(a => ids.Contains(a.LineId)).Select(Picked))]
                : [g.Key, packing && confirmed ? CompleteSum(g.Select(Shipped)) : g.Sum(l => l.RequestedQuantity)]);
        }
        doc.Tables.Add(totals);
        if (packing) doc.Notes.Add(words.Text("포장 내역 미확정 · 초안"));
        if (!confirmed) doc.Notes.Add(words.Text("출고 미확정"));
        return doc;
    }
}
