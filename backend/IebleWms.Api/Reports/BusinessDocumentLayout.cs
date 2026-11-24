namespace IebleWms.Api.Reports;

// One printable form model shared by PDF and Excel. Widths occupy a 60-unit A4 grid.
public enum DocumentCellStyle { Body, Label, Header, Emphasis, Summary, Note, Detail, Signature }
public sealed record DocumentPrintCell(object? Value, int Span, DocumentCellStyle Style = DocumentCellStyle.Body);
public sealed record DocumentPrintRow(DocumentPrintCell[] Cells, double MinimumHeight = 28);
public sealed record DocumentPrintGroup(string Context, List<DocumentPrintRow> Rows);
public sealed record DocumentPrintSection(string Title, DocumentPrintRow? Header, List<DocumentPrintGroup> Groups, bool Summary = false);
public sealed record BusinessDocumentLayout(string Title, string Number, string Issuer, object? CreatedAt,
    List<DocumentPrintRow> Information, List<DocumentPrintSection> Sections, List<DocumentPrintRow> Notes, string? Notice,
    DocumentPrintRow Signatures, string NotesTitle)
{
    public const int Grid = 60;
    static DocumentPrintCell V(object? v, int span, DocumentCellStyle style = DocumentCellStyle.Body) => new(v, span, style);
    static DocumentPrintRow R(params DocumentPrintCell[] cells) => new(cells);
    public static BusinessDocumentLayout Create(BusinessDocument doc)
    {
        var words = doc.Words;
        int labelSpan = words.IsEnglish ? 13 : 8;
        DocumentPrintRow Pair(string a, object? av, string b, object? bv) => R(V(words.Text(a), labelSpan, DocumentCellStyle.Label), V(av, 30-labelSpan), V(words.Text(b), labelSpan, DocumentCellStyle.Label), V(bv, 30-labelSpan));
        DocumentPrintRow Field(string label, object? value) => R(V(words.Text(label), labelSpan, DocumentCellStyle.Label), V(value, Grid-labelSpan));
        object? Info(string label) => doc.Information.FirstOrDefault(x => x.Label == label).Value;
        bool receipt = doc.Kind is "입고명세서" or "입고검수표", inspection = doc.Kind == "입고검수표";
        bool picking = doc.Kind == "출고피킹리스트", packing = doc.Kind == "출고패킹리스트";
        var info = new List<DocumentPrintRow>();
        if (receipt) {
            info.Add(Pair("거래처", Info("거래처"), "입고 창고", Info("창고")));
            info.Add(Pair("입고예정일", Info("입고 예정일"), inspection ? "검수일" : "실제입고일", Info(inspection ? "검수일" : "실제 입고일")));
            info.Add(Pair(inspection ? "검수담당자" : "담당자", Info(inspection ? "검수 담당자" : "담당자"), inspection ? "검수 상태" : "입고 상태", Info(inspection ? "검수 상태" : "입고 상태")));
        } else if (picking) {
            info.Add(Pair("출고 창고", Info("창고"), "거래처", Info("거래처")));
            // No separate picking schedule is stored; do not substitute the shipment date.
            info.Add(Pair("피킹예정일", null, "작업담당자", Info("작업 담당자")));
            info.Add(Pair("피킹 상태", Info("피킹 상태"), "출고 상태", Info("출고 상태")));
        } else if (packing) {
            info.Add(Pair("거래처", Info("거래처"), "출고일", Info("출고일")));
            info.Add(Pair("출고 창고", Info("창고"), "출고 상태", Info("출고 상태")));
            info.Add(Field("출고지", Info("출고지")));
        } else {
            info.Add(Pair("거래처", Info("거래처"), "출고 창고", Info("창고")));
            info.Add(Pair("출고지시일", Info("출고 지시일"), "출고예정일", Info("출고 예정일")));
            info.Add(Pair("담당자", Info("담당자"), "출고 상태", Info("출고 상태")));
            info.Add(Field("출고지", Info("출고지")));
        }
        var sections = new List<DocumentPrintSection>();
        foreach (var table in doc.Tables) {
            var widths = table.Columns.Select(c => (int)Math.Round(Grid * c.Width / table.Columns.Sum(c => c.Width))).ToArray();
            widths[^1] += Grid - widths.Sum();
            if (words.IsEnglish && table.Title == "검수 내역") widths = [4,20,5,8,8,7,8];
            if (words.IsEnglish && table.Title == "피킹 작업 내역") widths = [4,14,20,8,8,6];
            var header = R(table.Columns.Select((c, i) => V(words.Text(c.Title), widths[i], DocumentCellStyle.Header)).ToArray());
            bool summary = table.Title == "합계";
            var groups = new List<DocumentPrintGroup>();
            if (summary) groups.Add(new("품목 수", [R(V(words.Text(picking ? "총 피킹 대상 품목" : packing ? "총 상품 종류" : "총 품목 수"),20,DocumentCellStyle.Label),V(Info("총 품목 수"),40,DocumentCellStyle.Summary))]));
            for (int index = 0; index < table.Rows.Count; index++) {
                var data = table.Rows[index];
                var rows = new List<DocumentPrintRow> { new(data.Select((value, i) => V(value, widths[i], summary ? DocumentCellStyle.Summary : picking && table == doc.Tables[0] && i == 1 ? DocumentCellStyle.Emphasis : DocumentCellStyle.Body)).ToArray(), picking && !summary ? 38 : 30) };
                if (table.Details.TryGetValue(index, out var detail)) rows.Add(new([V(detail,Grid,DocumentCellStyle.Detail)],24));
                groups.Add(new($"{words.Text(table.Title)} {index + 1}",rows));
            }
            sections.Add(new(words.Text(table.Title),header,groups,summary));
        }
        var notes = new List<DocumentPrintRow> { new([V(Info("비고"),Grid)],42) };
        var signature = inspection ? "검수자" : picking ? "피킹 담당자" : packing ? "포장 담당자" : "담당자";
        return new(words.Text(doc.Title),doc.Number,doc.Issuer,Info("작성일"),info,sections,notes,
            doc.Notes.Count == 0 ? null : string.Join("\n",doc.Notes),
            new([V(words.Text(words.IsEnglish && doc.Kind == "출고지시서" ? "작성자" : signature) + " __________________",30,DocumentCellStyle.Signature),V(words.Text("확인자") + " __________________",30,DocumentCellStyle.Signature)],36),
            words.Text(inspection ? "특이사항·비고" : packing ? "특이사항" : !receipt && !picking ? "출고 요청사항" : "비고"));
    }
}
