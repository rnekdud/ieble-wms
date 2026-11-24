namespace IebleWms.Api.Reports;

// This catalog is exclusively for authored document text. Never pass business data
// (including names, codes, addresses and free-form notes) through Text.
public sealed class BusinessDocumentLanguage(string language, string kind)
{
    public bool IsEnglish => language == "en";
    public static string Normalize(string? language) => language is "ko" or "en" ? language
        : throw new IebleWms.Api.Organization.OrganizationException(400, "지원하지 않는 서류 언어입니다. ko 또는 en을 선택해 주세요.");
    public string Text(string source)
    {
        if (!IsEnglish) return source;
        return (source, kind) switch {
            ("거래처", "입고명세서") => "Supplier / Business Partner",
            ("거래처", "입고검수표") => "Supplier",
            ("입고번호", "입고명세서") => "GRN Number",
            ("지시수량", "출고피킹리스트") => "Required Qty",
            ("총 지시수량", "출고피킹리스트") => "Total Required Quantity",
            ("확인자", "출고지시서") => "Approved By",
            _ => English.GetValueOrDefault(source, source)
        };
    }
    public string Continued(string heading) => heading + (IsEnglish ? " (continued)" : " (계속)");
    public string NumberLabel => Text(kind.StartsWith("입고") ? "입고번호" : "출고번호");
    public string FileStem => IsEnglish ? Text(kind).Replace(" (GRN)", "").Replace(' ', '_') : kind;
    static readonly Dictionary<string, string> English = new(StringComparer.Ordinal) {
        ["입고명세서"] = "Goods Receipt Note (GRN)", ["입고 명세서"] = "Goods Receipt Note (GRN)",
        ["입고검수표"] = "Receiving Inspection Report", ["입고 검수표"] = "Receiving Inspection Report",
        ["출고지시서"] = "Outbound Order", ["출고패킹리스트"] = "Packing List", ["출고 패킹리스트"] = "Packing List",
        ["출고피킹리스트"] = "Picking List", ["출고 피킹리스트"] = "Picking List",
        ["입고번호"] = "Receipt Number", ["출고번호"] = "Outbound Order Number", ["작성일자"] = "Date Prepared",
        ["거래처"] = "Business Partner", ["창고"] = "Warehouse", ["입고 창고"] = "Receiving Warehouse", ["출고 창고"] = "Warehouse",
        ["입고예정일"] = "Expected Receipt Date", ["실제입고일"] = "Receipt Date", ["검수일"] = "Inspection Date",
        ["검수담당자"] = "Inspector", ["담당자"] = "Person in Charge", ["작업담당자"] = "Assigned Picker",
        ["입고 상태"] = "Receipt Status", ["검수 상태"] = "Inspection Status", ["출고 상태"] = "Order Status", ["피킹 상태"] = "Picking Status",
        ["출고지시일"] = "Order Date", ["출고예정일"] = "Scheduled Dispatch Date", ["피킹예정일"] = "Scheduled Picking Date",
        ["출고일"] = "Dispatch Date", ["출고지"] = "Dispatch Location", ["납품지"] = "Delivery Destination", ["포장 담당자"] = "Packed By",
        ["번호"] = "No.", ["순서"] = "No.", ["품목번호"] = "Item No.", ["상품코드"] = "Item Code",
        ["품명 / 규격"] = "Item Description / Specification", ["상품코드 / 품명"] = "Item Code / Description",
        ["단위"] = "Unit", ["예정수량"] = "Expected Qty", ["입고수량"] = "Received Qty", ["검수수량"] = "Inspected Qty",
        ["차이"] = "Difference", ["검수결과"] = "Inspection Result", ["지시수량"] = "Ordered Qty", ["출고수량"] = "Dispatched Qty",
        ["피킹수량"] = "Picked Qty", ["보관위치"] = "Storage Location", ["확인"] = "Check", ["포장번호"] = "Package No.", ["포장수량"] = "Packed Qty",
        ["LOT"] = "Lot Number", ["유통기한"] = "Expiration Date", ["시리얼"] = "Serial Number", ["위치 미지정"] = "Location Not Assigned",
        ["합계"] = "Totals", ["품목 수"] = "Item Count", ["총 품목 수"] = "Total Items", ["총 상품 종류"] = "Total Items",
        // The existing count is distinct products, not allocation/picking lines.
        ["총 피킹 대상 품목"] = "Total Items to Pick", ["총 피킹 대상"] = "Total Picking Lines",
        ["총 예정수량"] = "Total Expected Quantity", ["총 입고수량"] = "Total Received Quantity", ["총 검수수량"] = "Total Inspected Quantity",
        ["총 차이수량"] = "Total Quantity Difference", ["미검수 품목"] = "Pending Inspection Items", ["총 지시수량"] = "Total Ordered Quantity",
        ["총 출고 지시수량"] = "Total Ordered Quantity", ["총 출고수량"] = "Total Dispatched Quantity", ["실제 피킹수량"] = "Total Picked Quantity",
        ["총 수량"] = "Total Quantity", ["총 포장 건수"] = "Total Packages", ["총 처리수량"] = "Total Processed Quantity",
        ["비고"] = "Remarks", ["특이사항"] = "Remarks", ["특이사항·비고"] = "Remarks", ["출고 요청사항"] = "Special Instructions",
        ["검수자"] = "Inspected By", ["확인자"] = "Verified By", ["작성자"] = "Prepared By", ["피킹 담당자"] = "Picked By",
        ["기본정보"] = "General Information", ["입고 내역"] = "Receipt Items", ["검수 내역"] = "Inspection Details",
        ["피킹 작업 내역"] = "Picking Details", ["출고 지시 내역"] = "Order Items", ["출고 상품 내역"] = "Dispatched Items",
        ["출고 예정 상품 내역"] = "Planned Dispatch Items", ["LOT·유통기한 상세"] = "Lot and Expiration Details", ["품목 내역"] = "Item Details",
        ["등록된 내역 없음"] = "No items recorded",
        ["입고 예정"] = "Receipt Scheduled", ["검수 진행"] = "Inspection in Progress", ["검수 중"] = "Inspection in Progress",
        ["검수 완료"] = "Inspection Complete", ["미검수"] = "Not Inspected", ["정상"] = "Normal", ["수량 차이"] = "Quantity Discrepancy",
        ["출고 지시"] = "Ordered", ["피킹 진행"] = "Picking in Progress", ["피킹 완료"] = "Picking Complete", ["미피킹"] = "Not Picked",
        ["최종 검수 완료"] = "Final Inspection Complete", ["확정"] = "Confirmed", ["취소"] = "Cancelled",
        ["입고 미확정 · 입고수량 미확정"] = "Receipt Not Confirmed - Received Quantities Not Final",
        ["검수 미완료 · 검수 합계는 입력된 수량이며, 총 차이는 검수수량이 모두 입력된 후 표시합니다."] = "Inspection Incomplete - Totals include recorded quantities only. Total difference is shown once all quantities are entered.",
        ["포장 내역 미확정 · 초안"] = "DRAFT — Packing Details Not Confirmed", ["출고 미확정"] = "Dispatch Not Confirmed"
    };
}
