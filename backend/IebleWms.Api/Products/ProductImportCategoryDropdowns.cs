using System.IO.Compression;
using System.Xml.Linq;
using IebleWms.Api.Models;

namespace IebleWms.Api.Products;

public static partial class ProductImportWorkbook
{
    const string EmptyCategories = "WmsCategoryEmpty";
    static string CategoryRange(Guid id) => "WmsCat_" + id.ToString("N");
    // MATCH/COUNTIF interpret * ? ~ as patterns even in exact-match mode; treat category names literally.
    static string ExactLookup(string expression) => $"SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({expression},\"~\",\"~~\"),\"*\",\"~*\"),\"?\",\"~?\")";

    static XElement[] AddCategoryDropdowns(ZipArchive zip, List<(ProductCategory Category, string[] Names)> paths, XElement names, XElement validations)
    {
        // Excel lookups are case-insensitive. Never silently choose between ambiguous siblings.
        var ambiguous = paths.GroupBy(x => x.Category.ParentId).SelectMany(group => group.GroupBy(x => x.Category.Name, StringComparer.OrdinalIgnoreCase)
            .Where(siblings => siblings.Count() > 1).SelectMany(siblings => siblings.Select(x => x.Category.Id))).ToHashSet();
        var map = paths.ToDictionary(x => x.Category.Id, x => x.Category);
        bool Unambiguous(ProductCategory node)
        {
            while (true) { if (ambiguous.Contains(node.Id)) return false; if (!node.ParentId.HasValue) return true; node = map[node.ParentId.Value]; }
        }
        var available = paths.Where(x => Unambiguous(x.Category)).OrderBy(x => string.Join(" / ", x.Names), StringComparer.Ordinal).ToArray();
        var roots = available.Where(x => x.Names.Length == 1).ToArray();
        var seconds = available.Where(x => x.Names.Length == 2).ToArray();
        var cells = new SortedDictionary<int, SortedDictionary<int, XElement>>();
        void Add(int row, int col, string value) { if (!cells.ContainsKey(row)) cells[row] = []; cells[row][col] = Cell(row, col, value, 3); }
        void Formula(int row, int col, string formula, string cached = "")
        {
            if (!cells.ContainsKey(row)) cells[row] = [];
            cells[row][col] = new XElement(Ns + "c", new XAttribute("r", $"{(char)('A' + col - 1)}{row}"), new XAttribute("t", "str"), new XElement(Ns + "f", formula), new XElement(Ns + "v", cached));
        }
        void Define(string name, string range) => names.Add(new XElement(Ns + "definedName", new XAttribute("name", name), $"'카테고리 참조'!{range}"));
        void TableRange(string name, string col, int count) => Define(name, count == 0 ? "$F$2:$F$2" : $"${col}$2:${col}${count + 1}");
        string[] headers = ["1차 표시명", "1차 내부 키", "1차 키 + 2차 표시명", "2차 내부 키", "하위 선택값", "빈 목록", "", "행별 2차 목록", "행별 3차 목록", "행별 2차 선택값", "행별 3차 선택값"];
        for (var i = 0; i < headers.Length; i++) Add(1, i + 1, headers[i]);
        Add(2, 6, ""); Define(EmptyCategories, "$F$2:$F$2");
        for (var i = 0; i < roots.Length; i++) { Add(i + 2, 1, roots[i].Category.Name); Add(i + 2, 2, CategoryRange(roots[i].Category.Id)); }
        for (var i = 0; i < seconds.Length; i++)
        {
            var category = seconds[i].Category;
            Add(i + 2, 3, CategoryRange(category.ParentId!.Value) + "|" + category.Name);
            Add(i + 2, 4, CategoryRange(category.Id));
        }
        TableRange("WmsRootNames", "A", roots.Length); TableRange("WmsRootKeys", "B", roots.Length);
        TableRange("WmsSecondPaths", "C", seconds.Length); TableRange("WmsSecondKeys", "D", seconds.Length);
        var next = 2;
        foreach (var parent in available.Where(x => x.Names.Length < 3))
        {
            var start = next;
            foreach (var child in available.Where(x => x.Category.ParentId == parent.Category.Id)) Add(next++, 5, child.Category.Name);
            Define(CategoryRange(parent.Category.Id), next == start ? "$F$2:$F$2" : $"$E${start}:$E${next - 1}");
        }
        var secondSize = Math.Max(1, seconds.GroupBy(x => x.Category.ParentId).Select(g => g.Count()).DefaultIfEmpty().Max());
        var thirdSize = Math.Max(1, available.Where(x => x.Names.Length == 3).GroupBy(x => x.Category.ParentId).Select(g => g.Count()).DefaultIfEmpty().Max());
        for (var row = 2; row <= 501; row++)
        {
            var root = $"'상품 등록'!D{row}"; var second = $"'상품 등록'!E{row}";
            var level2 = $"IF({root}=\"\",\"{EmptyCategories}\",IFERROR(INDEX(WmsRootKeys,MATCH({ExactLookup(root)},WmsRootNames,0)),\"{EmptyCategories}\"))";
            var lookup = ExactLookup($"H{row}&\"|\"&{second}");
            var level3 = $"IF(OR({second}=\"\",H{row}=\"{EmptyCategories}\"),\"{EmptyCategories}\",IFERROR(INDEX(WmsSecondKeys,MATCH({lookup},WmsSecondPaths,0)),\"{EmptyCategories}\"))";
            Formula(row, 8, level2, EmptyCategories); Formula(row, 9, level3, EmptyCategories);
            // Sheets imports list validation only as a range, not an INDIRECT/INDEX expression.
            // Materialize each row's choices in static named ranges; evaluate formulas in cells.
            foreach (var (level, size, col, key) in new[] { (2, secondSize, 10, "H"), (3, thirdSize, 11, "I") })
            {
                var start = 2 + (row - 2) * size;
                for (var index = 0; index < size; index++)
                    Formula(start + index, col, $"IF(${key}${row}=\"{EmptyCategories}\",\"\",IFERROR(INDEX(INDIRECT(${key}${row}),{index + 1})&\"\",\"\"))");
                var letter = (char)('A' + col - 1);
                var name = $"WmsOptions{level}_{row}";
                Define(name, $"${letter}${start}:${letter}${start + size - 1}");
                AddValidation($"{(level == 2 ? "E" : "F")}{row}", name, level);
            }
        }
        Define("WmsRowLevel2", "$H$2:$H$501"); Define("WmsRowLevel3", "$I$2:$I$501");
        Put(zip, "xl/worksheets/sheet4.xml", new XDocument(new XElement(Ns + "worksheet", new XElement(Ns + "sheetData", cells.Select(row => new XElement(Ns + "row", new XAttribute("r", row.Key), row.Value.Values))))));
        var warnings = new List<XElement>();
        AddValidation("D2:D501", "WmsRootNames", 1);
        void AddValidation(string range, string list, int level)
        {
            var validation = Validation(range, "list", list);
            validation.SetAttributeValue("allowBlank", 0); // An empty parent must not let arbitrary child values bypass validation.
            validation.SetAttributeValue("showInputMessage", 1);
            validation.SetAttributeValue("promptTitle", $"{level}차 카테고리 선택");
            validation.SetAttributeValue("prompt", level == 1 ? "1차부터 순서대로 선택하세요. 상위 변경 후 잘못된 하위값은 지우고 다시 선택하세요." : $"같은 행의 {level - 1}차를 먼저 선택하세요. 현재 상위에 연결된 항목만 선택할 수 있습니다.");
            validations.Add(validation);
        }
        foreach (var (column, list, level) in new[] { ("D", "WmsRootNames", 1), ("E", "INDIRECT(INDEX(WmsRowLevel2,ROW()-1))", 2), ("F", "INDIRECT(INDEX(WmsRowLevel3,ROW()-1))", 3) })
        {
            warnings.Add(new XElement(Ns + "conditionalFormatting", new XAttribute("sqref", $"{column}2:{column}501"),
                new XElement(Ns + "cfRule", new XAttribute("type", "expression"), new XAttribute("dxfId", 0), new XAttribute("priority", level),
                    new XElement(Ns + "formula", $"AND({column}2<>\"\",COUNTIF({list},{ExactLookup(column + "2")})<>1)"))));
        }
        return warnings.ToArray();
    }
}
