namespace IebleWms.Api.Reports;

// Excel uses real table columns. The PDF's 60-unit drawing grid never becomes worksheet columns.
internal sealed record DocumentWorkbookSheet(string Name, BusinessDocumentLayout Layout, double[] ColumnPoints, bool Main);
internal static class BusinessDocumentSpreadsheetLayout
{
    internal static IReadOnlyList<DocumentWorkbookSheet> Create(BusinessDocument doc)
    {
        var source = BusinessDocumentLayout.Create(doc);
        var table = source.Sections.First();
        var count = table.Header!.Cells.Length;
        DocumentPrintRow Full(DocumentPrintRow row) => row with { Cells = [row.Cells[0] with { Span = count }] };
        var labelColumns = Math.Min(2, count - 1);
        DocumentPrintRow Field(DocumentPrintCell label, DocumentPrintCell value) => new([label with { Span = labelColumns }, value with { Span = count - labelColumns }]);
        var information = source.Information.SelectMany(row => Enumerable.Range(0, row.Cells.Length / 2)
            .Select(i => Field(row.Cells[i * 2], row.Cells[i * 2 + 1]))).ToList();
        var sections = new List<DocumentPrintSection> { Table(table) };
        foreach (var summary in source.Sections.Where(s => s.Summary)) {
            var groups = new List<DocumentPrintGroup>();
            foreach (var group in summary.Groups) {
                var rows = new List<DocumentPrintRow>();
                foreach (var row in group.Rows) {
                    if (group == summary.Groups[0]) rows.Add(Field(row.Cells[0], row.Cells[1]));
                    else for (var i = 0; i < row.Cells.Length; i++)
                        rows.Add(Field(summary.Header!.Cells[i] with { Style = DocumentCellStyle.Label }, row.Cells[i]));
                }
                groups.Add(group with { Rows = rows });
            }
            sections.Add(summary with { Header = null, Groups = groups });
        }
        var main = source with {
            Information = information, Sections = sections, Notes = source.Notes.Select(Full).ToList(),
            Signatures = source.Signatures with { Cells = [source.Signatures.Cells[0] with { Span = count / 2 }, source.Signatures.Cells[1] with { Span = count - count / 2 }] }
        };
        var sheets = new List<DocumentWorkbookSheet> { new(Name(doc.Words.IsEnglish ? source.Title : doc.Kind), main, Widths(table, doc.Words.IsEnglish), true) };
        // LOT tables have different fields and widths; keep their values typed on a dedicated sheet.
        foreach (var detail in source.Sections.Skip(1).Where(s => !s.Summary)) {
            var layout = source with { Title = detail.Title, Information = [], Sections = [Table(detail)], Notice = null, Notes = [], Signatures = new([]) };
            var name = Name(detail.Title);
            if (sheets.Any(s => s.Name == name)) name = Name(name[..Math.Min(name.Length, 27)] + " " + (sheets.Count + 1));
            sheets.Add(new(name, layout, Widths(detail, doc.Words.IsEnglish), false));
        }
        return sheets;
    }
    static string Name(string name) => new string(name.Select(c => "\\/*?:[]".Contains(c) ? '_' : c).Take(31).ToArray());
    static double[] Widths(DocumentPrintSection section, bool english)
    {
        var cells = section.Header!.Cells;
        var widths = cells.Select(c => 522d * c.Span / cells.Sum(x => x.Span)).ToArray();
        var minimums = cells.Select(c => english ? Math.Max(36d, BusinessDocument.Text(c.Value).Split([' ', '/', '\n']).Max(w => w.Length) * 6 + 14) : 36d).ToArray();
        var deficit = widths.Select((width, i) => Math.Max(0, minimums[i] - width)).Sum();
        var surplus = widths.Select((width, i) => Math.Max(0, width - minimums[i])).Sum();
        return widths.Select((width, i) => width < minimums[i] ? minimums[i] : width - (surplus == 0 ? 0 : deficit * (width - minimums[i]) / surplus)).ToArray();
    }
    static DocumentPrintSection Table(DocumentPrintSection section)
    {
        int count = section.Header!.Cells.Length;
        DocumentPrintRow Row(DocumentPrintRow row) => row with { Cells = row.Cells.Select(c => c with { Span = row.Cells.Length == 1 ? count : 1 }).ToArray() };
        return section with { Header = Row(section.Header), Groups = section.Groups.Select(g => g with { Rows = g.Rows.Select(Row).ToList() }).ToList() };
    }
}
