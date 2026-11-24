using System.Globalization;
using System.Text;
using PdfSharp;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
namespace IebleWms.Api.Reports;

public static class BusinessDocumentPdf
{
    sealed class FontResolver : IFontResolver
    {
        public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) => new("WmsDocumentFont", bold, italic);
        public byte[] GetFont(string faceName)
        {
            using var stream = typeof(BusinessDocumentPdf).Assembly.GetManifestResourceStream("WmsDocumentFont.ttf")!;
            using var output = new MemoryStream(); stream.CopyTo(output); return output.ToArray();
        }
    }
    static readonly object Gate = new();
    static void Font() { lock (Gate) { GlobalFontSettings.FontResolver ??= new FontResolver(); } }

    public static void Write(Stream output, BusinessDocument data, CancellationToken ct)
    {
        Font(); var layout = BusinessDocumentLayout.Create(data); var words = data.Words;
        using var pdf = new PdfDocument(); pdf.Info.Title = layout.Title + " · " + data.Number; pdf.Info.Author = data.Issuer;
        var body = new XFont("WMS", 10.5); var bold = new XFont("WMS", 10.5, XFontStyleEx.Bold);
        var small = new XFont("WMS", 9); var label = new XFont("WMS", 9.5, XFontStyleEx.Bold);
        var title = new XFont("WMS", 19, XFontStyleEx.Bold); var sectionFont = new XFont("WMS", 12, XFontStyleEx.Bold);
        var navy = new XSolidBrush(XColor.FromArgb(30, 30, 30)); var muted = new XSolidBrush(XColor.FromArgb(90, 90, 90));
        var pale = new XSolidBrush(XColor.FromArgb(244, 244, 244)); var sumFill = new XSolidBrush(XColor.FromArgb(237, 237, 237));
        var border = new XPen(XColor.FromArgb(145, 145, 145), .5);
        const double margin = 36, leading = 15, padding = 6;
        double y = 0, width = 0, bottom = 0; XGraphics? g = null;
        XFont CellFont(DocumentCellStyle s) => s switch { DocumentCellStyle.Header or DocumentCellStyle.Label => label, DocumentCellStyle.Emphasis or DocumentCellStyle.Summary => bold, DocumentCellStyle.Note or DocumentCellStyle.Detail => small, _ => body };
        List<string> Wrap(string text, double available, XFont font)
        {
            var lines = new List<string>();
            foreach (var part in text.Replace("\r", "").Split('\n')) {
                var current = new StringBuilder(); var chars = StringInfo.GetTextElementEnumerator(part);
                while (chars.MoveNext()) {
                    var next = chars.GetTextElement();
                    if (current.Length > 0 && g!.MeasureString(current.ToString() + next, font).Width > available) {
                        var split = words.IsEnglish ? current.ToString().LastIndexOf(' ') : -1;
                        if (split > 0) { lines.Add(current.ToString(0, split)); current.Remove(0, split + 1); }
                        else { lines.Add(current.ToString()); current.Clear(); }
                    }
                    current.Append(next);
                }
                lines.Add(current.ToString());
            }
            return lines;
        }
        void Page()
        {
            g?.Dispose(); var p = pdf.AddPage(); p.Size = PageSize.A4; p.Orientation = PageOrientation.Portrait;
            p.Width = XUnit.FromMillimeter(210); p.Height = XUnit.FromMillimeter(297);
            g = XGraphics.FromPdfPage(p); width = p.Width.Point - 2 * margin; bottom = p.Height.Point - 40; y = margin;
            var first = pdf.PageCount == 1;
            var headingFont = first ? title : sectionFont;
            foreach (var text in Wrap(layout.Title, width, headingFont)) {
                g.DrawString(text, headingFont, navy, new XRect(margin, y, width, first ? 30 : 20), XStringFormats.Center);
                y += first ? 30 : 20;
            }
            y += first ? 12 : 5;
            var created = BusinessDocument.Text(layout.CreatedAt);
            var left = (words.NumberLabel + "  ") + layout.Number;
            var metadata = new DocumentPrintRow([new(left, 36, DocumentCellStyle.Note), new(words.Text("작성일자") + "  " + created, 24, DocumentCellStyle.Note)]);
            Draw(metadata);
            g.DrawLine(new XPen(navy.Color, 1), margin, y, margin + width, y); y += 10;
        }
        List<string>[] Lines(DocumentPrintRow row) => row.Cells.Select(c => Wrap(BusinessDocument.Text(c.Value), width * c.Span / BusinessDocumentLayout.Grid - 2 * padding, CellFont(c.Style))).ToArray();
        double Height(DocumentPrintRow row) => Math.Max(row.MinimumHeight, Lines(row).Max(x => x.Count) * leading + 2 * padding);
        void SectionTitle(string text) { g!.DrawString(text, sectionFont, navy, new XPoint(margin, y + 15)); y += 22; }
        void Draw(DocumentPrintRow row, Action? continued = null)
        {
            var lines = Lines(row); var offset = 0; var count = lines.Max(x => x.Count);
            while (offset < count) {
                ct.ThrowIfCancellationRequested();
                if (bottom - y < leading + 2 * padding) { Page(); continued?.Invoke(); }
                var take = Math.Min(count - offset, Math.Max(1, (int)((bottom - y - 2 * padding) / leading)));
                var h = Math.Max(row.MinimumHeight, take * leading + 2 * padding); var x = margin;
                for (var i = 0; i < row.Cells.Length; i++) {
                    var c = row.Cells[i]; var w = width * c.Span / BusinessDocumentLayout.Grid;
                    var fill = c.Style switch { DocumentCellStyle.Header => sumFill, DocumentCellStyle.Label => pale, DocumentCellStyle.Summary => sumFill, _ => XBrushes.White };
                    g!.DrawRectangle(fill, x, y, w, h);
                    if (c.Style is not (DocumentCellStyle.Note or DocumentCellStyle.Signature)) g.DrawRectangle(border, x, y, w, h);
                    var font = CellFont(c.Style); var ink = navy;
                    for (var n = 0; n < take && offset + n < lines[i].Count; n++) {
                        var text = lines[i][offset + n]; var tx = x + padding;
                        if (c.Style == DocumentCellStyle.Header || Equals(c.Value,"□")) tx = x + (w - g.MeasureString(text, font).Width) / 2;
                        else if (c.Value is decimal or int or long) tx = x + w - padding - g.MeasureString(text, font).Width;
                        g.DrawString(text, font, ink, new XPoint(tx, y + (h - take * leading) / 2 + 11 + n * leading));
                    }
                    x += w;
                }
                y += h; offset += take;
                if (offset < count) { Page(); continued?.Invoke(); }
            }
        }
        Page();
        if (layout.Notice != null) { Draw(new([new(layout.Notice, BusinessDocumentLayout.Grid, DocumentCellStyle.Summary)])); y += 12; }
        foreach (var row in layout.Information) {
            if (y + Height(row) > bottom) { Page(); SectionTitle(words.Continued(words.Text("기본정보"))); }
            Draw(row, () => SectionTitle(words.Continued(words.Text("기본정보"))));
        }
        foreach (var section in layout.Sections) {
            y += 8;
            var headHeight = section.Header == null ? 0 : Height(section.Header);
            var firstHeight=section.Groups.FirstOrDefault()?.Rows.Sum(Height) ?? 27;
            var opening=firstHeight < bottom-160-headHeight ? firstHeight : 54;
            if (y + 25 + headHeight + opening > bottom) Page();
            SectionTitle(section.Title);
            if(section.Summary && section.Groups.Count>0) foreach(var row in section.Groups[0].Rows) Draw(row);
            if (section.Header != null) Draw(section.Header);
            void Repeat() { SectionTitle(words.Continued(section.Title)); if (section.Header != null) Draw(section.Header); }
            if (section.Groups.Count == 0) Draw(new([new(words.Text("등록된 내역 없음"), BusinessDocumentLayout.Grid)]), Repeat);
            foreach (var group in section.Groups.Skip(section.Summary?1:0)) {
                var groupHeight = group.Rows.Sum(Height);
                // Move ordinary items as a unit; oversized rows are split without losing text.
                if (y + groupHeight > bottom && groupHeight < bottom - 160 - headHeight) { Page(); Repeat(); }
                foreach (var row in group.Rows) {
                    void Continued() { Repeat(); Draw(new([new(words.Continued(group.Context), BusinessDocumentLayout.Grid, DocumentCellStyle.Label)])); }
                    if (y + Height(row) > bottom && Height(row) < bottom - 200 - headHeight) { Page(); Continued(); }
                    Draw(row, Continued);
                }

            }
        }
        y += 10;
        if (y + 22 + layout.Notes.Sum(Height) + 6 + Height(layout.Signatures) > bottom) Page();
        SectionTitle(layout.NotesTitle);
        foreach (var row in layout.Notes) Draw(row, () => SectionTitle(words.Continued(layout.NotesTitle)));
        if (y + 6 + Height(layout.Signatures) > bottom) Page();
        y += 6;
        Draw(layout.Signatures);
        g?.Dispose();
        for (var i = 0; i < pdf.PageCount; i++) {
            ct.ThrowIfCancellationRequested(); var p = pdf.Pages[i]; using var footer = XGraphics.FromPdfPage(p, XGraphicsPdfPageOptions.Append);
            footer.DrawString($"{i + 1} / {pdf.PageCount}", small, muted, new XRect(margin, p.Height.Point - 28, width, 14), XStringFormats.Center);
        }
        pdf.Save(output, false);
    }
}
