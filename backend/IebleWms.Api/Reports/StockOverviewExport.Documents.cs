using System.Globalization;
using System.IO.Compression;
using System.Xml.Linq;
namespace IebleWms.Api.Reports;

public static partial class StockOverviewExport
{
    static readonly XNamespace SheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static readonly XNamespace RelNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    static XElement E(string name, params object?[] content) => new(SheetNs + name, content);
    static string Column(int n) { var s = ""; for (n++; n > 0; n = (n - 1) / 26) s = (char)('A' + (n - 1) % 26) + s; return s; }
    static XElement Cell(int row, int col, object? value, int style = 14)
    {
        var reference = Column(col) + row;
        if (value is decimal or int or long) {
            var number=Convert.ToDecimal(value);var integer=decimal.Truncate(number)==number;
            return E("c",new XAttribute("r",reference),new XAttribute("s",style==6?(integer?12:7):(integer?11:2)),E("v",number.ToString(CultureInfo.InvariantCulture)));
        }
        if (value is DateOnly date) return E("c", new XAttribute("r", reference), new XAttribute("s", 3), E("v", date.ToDateTime(TimeOnly.MinValue).ToOADate().ToString(CultureInfo.InvariantCulture)));
        var text = BusinessDocument.Text(value); text = new string(text.Where(c => System.Xml.XmlConvert.IsXmlChar(c) || char.IsSurrogate(c)).ToArray());
        return E("c", new XAttribute("r", reference), new XAttribute("t", "inlineStr"), new XAttribute("s", style), E("is", E("t", new XAttribute(XNamespace.Xml + "space", "preserve"), text)));
    }
    static int PrintStyle(DocumentCellStyle style) => style switch { DocumentCellStyle.Header => 1, DocumentCellStyle.Label => 5, DocumentCellStyle.Emphasis => 9, DocumentCellStyle.Summary => 6, DocumentCellStyle.Note or DocumentCellStyle.Signature => 8, DocumentCellStyle.Detail => 13, _ => 14 };
    public static void WriteDocument(Stream output, BusinessDocument doc, CancellationToken ct)
    {
        var plans = BusinessDocumentSpreadsheetLayout.Create(doc); var words = doc.Words;
        using var zip = new ZipArchive(output, ZipArchiveMode.Create, true);
        XNamespace types = "http://schemas.openxmlformats.org/package/2006/content-types", relations = "http://schemas.openxmlformats.org/package/2006/relationships";
        var content = new XElement(types + "Types", new XElement(types + "Default", new XAttribute("Extension", "rels"), new XAttribute("ContentType", "application/vnd.openxmlformats-package.relationships+xml")), new XElement(types + "Default", new XAttribute("Extension", "xml"), new XAttribute("ContentType", "application/xml")));
        void Type(string path, string type) => content.Add(new XElement(types + "Override", new XAttribute("PartName", path), new XAttribute("ContentType", type)));
        Type("/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"); Type("/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml");
        XElement Link(string id, string type, string target) => new(relations + "Relationship", new XAttribute("Id", id), new XAttribute("Type", RelNs.NamespaceName + "/" + type), new XAttribute("Target", target));
        Text(zip, "_rels/.rels", new XElement(relations + "Relationships", Link("rId1", "officeDocument", "xl/workbook.xml")).ToString());
        var workbookSheets = E("sheets"); var names = E("definedNames");
        var sheetLinks = new XElement(relations + "Relationships", Link("styles", "styles", "styles.xml"));
        for (var sheetIndex = 0; sheetIndex < plans.Count; sheetIndex++) {
            var plan = plans[sheetIndex]; var layout = plan.Layout; var columnCount = plan.ColumnPoints.Length;
            var sheetId = sheetIndex + 1; var sheetPath = $"worksheets/sheet{sheetId}.xml";
            Type("/xl/" + sheetPath, "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
            sheetLinks.Add(Link("rId" + sheetId, "worksheet", sheetPath));
            workbookSheets.Add(E("sheet", new XAttribute("name", plan.Name), new XAttribute("sheetId", sheetId), new XAttribute(RelNs + "id", "rId" + sheetId)));
            double pageBodyHeight = 680; // Recomputed below for the actual repeated title block.
            var rows = E("sheetData"); var merges = E("mergeCells"); var breaks = E("rowBreaks"); int row = 1, frozen = 3; double used = 0;
            // Measure against the actual columns used by each logical cell.
            List<string> Wrap(object? value, int start, int span)
            {
                var result = new List<string>(); var limit = plan.ColumnPoints.Skip(start).Take(span).Sum() - 12;
                foreach (var part in BusinessDocument.Text(value).Replace("\r", "").Split('\n')) {
                    var current = ""; double size = 0;
                    foreach (var rune in part.EnumerateRunes()) {
                        double next = rune.Value > 255 ? 11 : 6;
                        if (size + next > limit && current.Length > 0) {
                            var split = words.IsEnglish ? current.LastIndexOf(' ') : -1;
                            if (split > 0) { result.Add(current[..split]); current = current[(split + 1)..]; size = current.EnumerateRunes().Sum(c => c.Value > 255 ? 11d : 6d); }
                            else { result.Add(current); current = ""; size = 0; }
                        }
                        current += rune.ToString(); size += next;
                    }
                    result.Add(current);
                }
                return result;
            }
            List<string>[] Wrapped(DocumentPrintRow r) {
                int start = 0;
                return r.Cells.Select(c => { var lines = Wrap(c.Value, start, c.Span); start += c.Span; return lines; }).ToArray();
            }
            double Height(DocumentPrintRow r) => Math.Max(r.MinimumHeight, Wrapped(r).Max(c => c.Count) * 15 + 12);
            void Raw(DocumentPrintRow r, double height, int? forcedStyle = null)
            {
                var xml = E("row", new XAttribute("r", row), new XAttribute("ht", height), new XAttribute("customHeight", 1)); int col = 0;
                foreach (var cell in r.Cells) {
                    var style = forcedStyle ?? PrintStyle(cell.Style); xml.Add(Cell(row, col, cell.Value, style));
                    for (var extra = 1; extra < cell.Span; extra++) xml.Add(E("c", new XAttribute("r", Column(col + extra) + row), new XAttribute("s", style)));
                    if (cell.Span > 1) merges.Add(E("mergeCell", new XAttribute("ref", $"{Column(col)}{row}:{Column(col + cell.Span - 1)}{row}")));
                    col += cell.Span;
                }
                if (col != columnCount) throw new InvalidOperationException("Document row must occupy the worksheet columns.");
                rows.Add(xml); row++; used += height;
            }
            DocumentPrintRow Full(string text, DocumentCellStyle style = DocumentCellStyle.Body) => new([new(text, columnCount, style)]);
            void NewPage(Action? repeat = null) { breaks.Add(E("brk", new XAttribute("id", row - 1), new XAttribute("min", 0), new XAttribute("max", 16383), new XAttribute("man", 1))); used = 0; repeat?.Invoke(); }
            void Draw(DocumentPrintRow r, Action? repeat = null)
            {
                ct.ThrowIfCancellationRequested();
                var wrapped = Wrapped(r); var count = wrapped.Max(v => v.Count); var offset = 0;
                while (offset < count) {
                    if (used + 28 > pageBodyHeight) NewPage(repeat);
                    var take = Math.Min(count - offset, Math.Min(24, Math.Max(1, (int)((pageBodyHeight - used - 12) / 15))));
                    if (offset == 0 && take == count) Raw(r, Math.Max(r.MinimumHeight, count * 15 + 12));
                    else {
                        var cells = r.Cells.Select((c, i) => c with { Value = c.Value is string ? string.Join("\n", wrapped[i].Skip(offset).Take(take)) : offset == 0 ? c.Value : "" }).ToArray();
                        Raw(new(cells), Math.Max(r.MinimumHeight, take * 15 + 12));
                    }
                    offset += take; if (offset < count) NewPage(repeat);
                }
            }
            void Title(string title) => Raw(Full(title), 28, 10);
            Raw(Full(layout.Title), 42, 4);
            var metadata = new DocumentPrintRow([new((words.NumberLabel + "  ") + layout.Number,columnCount / 2,DocumentCellStyle.Note),new(words.Text("작성일자") + "  " + BusinessDocument.Text(layout.CreatedAt),columnCount - columnCount / 2,DocumentCellStyle.Note)]);
            Raw(metadata, Height(metadata));
            Raw(Full(" ",DocumentCellStyle.Note),8);
            rows.Elements().Last().Elements().First().Element(SheetNs + "is")!.Element(SheetNs + "t")!.Value = "";
            pageBodyHeight = 758 - used;
            used = 0; // These header rows repeat on each printed page.
            if (layout.Notice != null) Draw(Full(layout.Notice, DocumentCellStyle.Summary));
            foreach (var r in layout.Information) Draw(r, () => Title(words.Continued(words.Text("기본정보"))));
            foreach (var section in layout.Sections) {
                // Keep the closing totals, remarks and signatures together whenever they fit a page.
                if (section.Summary && plan.Main) {
                    var closing = 28 + section.Groups.Sum(g => g.Rows.Sum(Height)) + 28 + layout.Notes.Sum(Height) + Height(layout.Signatures);
                    if (closing <= pageBodyHeight && used + closing > pageBodyHeight) NewPage();
                }
                var h = section.Header == null ? 0 : Height(section.Header);
                var firstHeight=section.Groups.FirstOrDefault()?.Rows.Sum(Height) ?? 28;
                var opening=firstHeight < pageBodyHeight-28-h ? firstHeight : 56;
                if (used + 28 + h + opening > pageBodyHeight) NewPage();
                Title(section.Title);
                if(section.Summary && section.Groups.Count>0) foreach(var r in section.Groups[0].Rows) Draw(r);
                if (section.Header != null) Draw(section.Header);
                if (frozen == 3) frozen = row - 1;
                void Repeat() { Title(words.Continued(section.Title)); if (section.Header != null) Draw(section.Header); }
                if (section.Groups.Count == 0) Draw(Full(words.Text("등록된 내역 없음")), Repeat);
                foreach (var group in section.Groups.Skip(section.Summary?1:0)) {
                    var total = group.Rows.Sum(Height);
                    if (used + total > pageBodyHeight && total < pageBodyHeight - 28 - h) NewPage(Repeat);
                    foreach (var r in group.Rows) {
                        void Continued() { Repeat(); Draw(Full(words.Continued(group.Context), DocumentCellStyle.Label)); }
                        if (used + Height(r) > pageBodyHeight && Height(r) < pageBodyHeight - h - 84) NewPage(Continued);
                        Draw(r, Continued);
                    }
                }
            }
            if (plan.Main) {
            if (used + 28 + layout.Notes.Sum(Height) + Height(layout.Signatures) > pageBodyHeight) NewPage(); Title(layout.NotesTitle); foreach (var r in layout.Notes) Draw(r, () => Title(words.Continued(layout.NotesTitle))); Draw(layout.Signatures);
            }
            var sheetName = plan.Name.Replace("'", "''"); var lastColumn = Column(columnCount - 1);
            names.Add(E("definedName", new XAttribute("name", "_xlnm.Print_Area"), new XAttribute("localSheetId", sheetIndex), $"'{sheetName}'!$A$1:${lastColumn}${row - 1}"),
                E("definedName", new XAttribute("name", "_xlnm.Print_Titles"), new XAttribute("localSheetId", sheetIndex), $"'{sheetName}'!$1:$3"));
            breaks.SetAttributeValue("count", breaks.Elements().Count()); breaks.SetAttributeValue("manualBreakCount", breaks.Elements().Count());
            var sheet = E("worksheet", E("sheetPr", E("pageSetUpPr", new XAttribute("fitToPage", 1))), E("dimension", new XAttribute("ref", $"A1:{lastColumn}{row - 1}")), E("sheetViews", E("sheetView", new XAttribute("workbookViewId", 0), new XAttribute("showGridLines", 0), E("pane", new XAttribute("ySplit", frozen), new XAttribute("topLeftCell", "A" + (frozen + 1)), new XAttribute("state", "frozen"), new XAttribute("activePane", "bottomLeft")))),
                E("cols", plan.ColumnPoints.Select((points, i) => E("col", new XAttribute("min", i + 1), new XAttribute("max", i + 1), new XAttribute("width", (points / .75 - 5) / 7), new XAttribute("customWidth", 1)))), rows, merges,
                E("printOptions", new XAttribute("horizontalCentered", 1), new XAttribute("gridLines", 0), new XAttribute("gridLinesSet", 1)),
                E("pageMargins", new XAttribute("left", .45), new XAttribute("right", .45), new XAttribute("top", .45), new XAttribute("bottom", .45), new XAttribute("header", .15), new XAttribute("footer", .15)),
                E("pageSetup", new XAttribute("paperSize", 9), new XAttribute("orientation", "portrait"), new XAttribute("fitToWidth", 1), new XAttribute("fitToHeight", 0)),
                E("headerFooter", E("oddFooter", "&C&P / &N")), breaks);
            Text(zip, "xl/" + sheetPath, sheet.ToString());
        }
        Text(zip, "xl/_rels/workbook.xml.rels", sheetLinks.ToString());
        Text(zip, "xl/workbook.xml", E("workbook", new XAttribute(XNamespace.Xmlns + "r", RelNs), workbookSheets, names).ToString());
        Text(zip, "[Content_Types].xml", content.ToString());
        Text(zip, "xl/styles.xml", """
        <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>
        <fonts count="5"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FF202020"/><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FF202020"/><sz val="19"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><sz val="10"/><color rgb="FF5A5A5A"/><name val="맑은 고딕"/></font></fonts>
        <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
        <borders count="2"><border/><border><left style="thin"><color rgb="FF919191"/></left><right style="thin"><color rgb="FF919191"/></right><top style="thin"><color rgb="FF919191"/></top><bottom style="thin"><color rgb="FF919191"/></bottom></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="15">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="1" fillId="2" borderId="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="0" fillId="0" borderId="1" numFmtId="164" applyNumberFormat="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="right" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="0" fillId="0" borderId="1" numFmtId="165" applyNumberFormat="1" xfId="0"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="2" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="3" borderId="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="4" borderId="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="4" borderId="1" numFmtId="164" applyNumberFormat="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="right" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="4" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="0" borderId="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="0" fillId="0" borderId="1" numFmtId="3" applyNumberFormat="1" xfId="0"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="3" fillId="4" borderId="1" numFmtId="3" applyNumberFormat="1" xfId="0"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="4" fillId="0" borderId="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        <xf applyFont="1" applyAlignment="1" applyBorder="1" applyFill="1" fontId="0" fillId="0" borderId="1" numFmtId="49" applyNumberFormat="1" xfId="0"><alignment wrapText="1" vertical="center" horizontal="left" indent="1"/></xf>
        </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>
        """);
    }
}
