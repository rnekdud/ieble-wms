using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Reports;

// Reuse the existing XLSX writer; the template has only the actual document inputs.
public static class DocumentPasteTemplate
{
    public static async Task<FileContentResult> Download(bool outbound, CancellationToken ct)
    {
        using var stream = new MemoryStream();
        var title = outbound ? "출고" : "입고";
        await StockOverviewExport.Write(stream, Rows(), "xlsx", ["상품명", outbound ? "요청 수량" : "예정 수량"], row => row, title + " 상품", ct);
        return new FileContentResult(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") { FileDownloadName = title + "_엑셀_붙여넣기.xlsx" };
    }
    static async IAsyncEnumerable<object?[]> Rows() { await Task.CompletedTask; yield break; }
}
