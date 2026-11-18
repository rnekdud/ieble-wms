using System.IO.Compression;
using System.Xml.Linq;
using IebleWms.Api.Models;
using IebleWms.Api.Reports;

namespace IebleWms.Api.Products;

public static partial class ProductImportWorkbook
{
    // Keep canonical header names stable; the reader maps names rather than positions.
    public static Task<byte[]> Template(CancellationToken ct) => Template(
        DefaultProductClassification.CategoryRows(Guid.Empty), DefaultProductClassification.TypeRows(Guid.Empty), ct);

    public static async Task<byte[]> Template(IReadOnlyList<ProductCategory> categories, IReadOnlyList<ProductType> types, CancellationToken ct)
    {
        using var file = new MemoryStream();
        await StockOverviewExport.Write(file, Empty(), "xlsx", Headers, x => x, "상품 등록", ct);
        using (var zip = new ZipArchive(file, ZipArchiveMode.Update, true))
        {
            var contentTypes = Load(zip, "[Content_Types].xml");
            var book = Load(zip, "xl/workbook.xml");
            var rels = Load(zip, "xl/_rels/workbook.xml.rels");
            foreach (var (number, name) in new[] { (2, "작성 안내"), (3, "선택값 안내"), (4, "카테고리 참조") })
            {
                contentTypes.Root!.Add(new XElement(contentTypes.Root.Name.Namespace + "Override", new XAttribute("PartName", $"/xl/worksheets/sheet{number}.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml")));
                book.Root!.Element(Ns + "sheets")!.Add(new XElement(Ns + "sheet", new XAttribute("name", name), new XAttribute("sheetId", number), new XAttribute(XName.Get("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"), $"rId{number}")));
                rels.Root!.Add(new XElement(Rel + "Relationship", new XAttribute("Id", $"rId{number}"), new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"), new XAttribute("Target", $"worksheets/sheet{number}.xml")));
            }
            book.Descendants(Ns + "sheet").Single(x => (string?)x.Attribute("name") == "카테고리 참조").SetAttributeValue("state", "hidden");
            contentTypes.Root!.Add(new XElement(contentTypes.Root.Name.Namespace + "Override", new XAttribute("PartName", "/xl/styles.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml")));
            rels.Root!.Add(new XElement(Rel + "Relationship", new XAttribute("Id", "rIdStyles"), new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"), new XAttribute("Target", "styles.xml")));
            Put(zip, "[Content_Types].xml", contentTypes); Put(zip, "xl/_rels/workbook.xml.rels", rels);
            Put(zip, "xl/styles.xml", XDocument.Parse(Styles));

            // Only active paths with active ancestors may be offered by this tenant workbook.
            var paths = new List<(ProductCategory Category, string[] Names)>();
            var map = categories.ToDictionary(x => x.Id);
            foreach (var category in categories.Where(x => x.IsActive))
            {
                var names = new List<string>(); var node = category; var seen = new HashSet<Guid>();
                while (node.IsActive && seen.Add(node.Id) && names.Count < 3)
                {
                    names.Insert(0, node.Name);
                    if (!node.ParentId.HasValue) { paths.Add((category, names.ToArray())); break; }
                    if (!map.TryGetValue(node.ParentId.Value, out node!)) break;
                }
            }
            var activeTypes = types.Where(x => x.IsActive).OrderBy(x => x.Name).ToArray();
            var lists = new[] { activeTypes.Select(x => x.Name).Distinct().ToArray() }
                .Concat(Enumerable.Range(1, 3).Select(depth => paths.Where(x => x.Names.Length == depth).Select(x => x.Category.Name).Distinct().Order().ToArray())).ToArray();
            var optionRows = new List<string[]> { new[] { "종류", "제공 구분", "1차 카테고리 / 상품 구분", "2차 카테고리", "3차 카테고리", "", "상품 구분 선택값", "1차 선택값", "2차 선택값", "3차 선택값" } };
            optionRows.AddRange(activeTypes.Select(x => new[] { "상품 구분", x.IsSystem ? "시스템 기본" : "기업 추가", x.Name }));
            optionRows.AddRange(paths.OrderBy(x => string.Join(" / ", x.Names)).Select(x => new[] { "카테고리", x.Category.IsSystem ? "시스템 기본" : "기업 추가" }.Concat(x.Names).ToArray()));
            var optionSheet = Sheet(optionRows, [18, 18, 30, 28, 28, 3, 26, 26, 26, 26]);
            var data = optionSheet.Root!.Element(Ns + "sheetData")!;
            var definedNames = new XElement(Ns + "definedNames");
            var validations = new XElement(Ns + "dataValidations");
            for (var i = 0; i < lists.Length; i++)
            {
                if (lists[i].Length == 0) continue;
                var letter = (char)('G' + i); var name = $"ProductImportChoices{i}";
                definedNames.Add(new XElement(Ns + "definedName", new XAttribute("name", name), $"'선택값 안내'!${letter}$2:${letter}${lists[i].Length + 1}"));
                for (var j = 0; j < lists[i].Length; j++)
                {
                    var row = data.Elements(Ns + "row").SingleOrDefault(x => (int)x.Attribute("r")! == j + 2);
                    if (row == null) { row = new XElement(Ns + "row", new XAttribute("r", j + 2)); data.Add(row); }
                    row.Add(Cell(j + 2, i + 7, lists[i][j], 0));
                }
                if (i == 0) validations.Add(Validation("C2:C501", "list", name));
            }
            var categoryWarnings = AddCategoryDropdowns(zip, paths, definedNames, validations);
            validations.Add(Validation("N2:N501", "list", "\"인박스,낱개\""));
            validations.SetAttributeValue("count", validations.Elements().Count());
            book.Root!.Add(definedNames, new XElement(Ns + "calcPr", new XAttribute("calcMode", "auto"), new XAttribute("fullCalcOnLoad", 1), new XAttribute("forceFullCalc", 1))); Put(zip, "xl/workbook.xml", book);
            Put(zip, "xl/worksheets/sheet3.xml", optionSheet);

            var registration = Sheet([Headers.Select((h, i) => i == 0 ? h + " (필수)" : h).ToArray()], [30, 22, 24, 25, 25, 25, 22, 18, 18, 18, 18, 18, 18, 20, 24, 26, 26, 26, 26, 40]);
            var cols = registration.Root!.Element(Ns + "cols")!.Elements().ToArray();
            for (var i = 0; i < cols.Length; i++) cols[i].SetAttributeValue("style", i is 8 or 9 ? 4 : i is 10 or 11 or 12 or 14 ? 5 : 3);
            registration.Descendants(Ns + "c").First().SetAttributeValue("s", 2);
            registration.Root.Add(new XElement(Ns + "autoFilter", new XAttribute("ref", "A1:T501")), categoryWarnings, validations);
            Put(zip, "xl/worksheets/sheet1.xml", registration);

            string[] descriptions = [
                "1~200자. 상품 등록 시트 2행부터 최대 500개 상품을 입력합니다.",
                "최대 64자. 공란이면 PR01, PR02 방식으로 자동 생성합니다. 기업 내 중복 불가. 기존 상품 수정용이 아닙니다.",
                "선택값 안내의 사용 가능한 상품 구분명 또는 드롭다운을 선택합니다.",
                "시스템 기본·현재 기업의 사용 가능한 1차 카테고리를 선택합니다. 공란이면 미분류입니다.",
                "같은 행에서 1차를 먼저 선택하세요. 해당 1차에 속한 2차만 드롭다운에 표시됩니다.",
                "같은 행에서 2차까지 먼저 선택하세요. 해당 2차에 속한 3차만 드롭다운에 표시됩니다.",
                "최대 100자. 상품의 모델 번호를 입력합니다.", "최대 100자. 국내산, 국가명 등을 입력합니다.",
                "KRW, 0~999,999,999,999.99, 소수점 2자리 이내. 5000 또는 5,000. 공란은 미설정입니다.",
                "KRW, 0~999,999,999,999.99, 소수점 2자리 이내. 3000 또는 3,000. 공란은 미설정입니다.",
                "EA 기준 0~999,999,999 정수. 공란은 미설정이며 실제 재고가 생기지 않습니다.",
                "인박스 1개에 담기는 낱개(EA) 수. 1~999,999,999 정수. 사용하지 않으면 공란입니다.",
                "아웃박스 1개에 담기는 인박스 또는 낱개 수. 1~999,999,999 정수. 인박스 구성일 때 인박스 수량이 필요합니다.",
                "인박스 / 낱개. 공란은 인박스. 인박스 없이 낱개를 바로 담는 아웃박스는 낱개를 선택합니다.",
                "파레트 1개에 담기는 아웃박스 수. 1~999,999,999 정수. 아웃박스 수량이 필요합니다.",
                "텍스트 형식 유지. 앞자리 0 및 긴 숫자를 그대로 입력합니다. 숫자로 저장된 바코드는 업로드가 차단됩니다.",
                "텍스트 형식 유지. 인박스 수량을 먼저 입력합니다. 다른 포장·상품·랙·위치와 중복 불가.",
                "텍스트 형식 유지. 아웃박스 환산 설정이 필요합니다. 지수 표기나 반올림된 숫자를 복사하지 마세요.",
                "텍스트 형식 유지. 파레트당 아웃박스 설정이 필요합니다. 숫자 원본은 텍스트 형식 지정 후 다시 입력하세요.",
                "최대 2,000자. 줄바꿈 가능. 수식 대신 값을 입력합니다."
            ];
            var guideRows = new List<string[]> { new[] { "항목", "필수 / 선택", "입력 형식 및 작성 방법" },
                new[] { "양식 버전", "3", "상품 등록만 업로드합니다. 작성 안내의 예시는 등록되지 않습니다. 기존 EA 양식과 열 순서 변경을 지원합니다." },
                new[] { "재고 및 포장", "EA", "모든 재고는 개(EA) 기준입니다. 인박스·아웃박스·파레트는 환산 설정이며 재고는 별도 입고합니다." } };
            guideRows.AddRange(Headers.Select((h, i) => new[] { h, i == 0 ? "필수" : "선택", descriptions[i] }));
            guideRows.Add(["상위 카테고리 변경", "하위값 재선택", "매크로 없는 .xlsx는 기존 하위 입력값을 자동 삭제하지 않습니다. 상위 변경·삭제 후 붉게 표시된 하위값을 지우고 다시 선택하세요. 유효한 연결은 그대로 유지됩니다."]);
            guideRows.Add(["카테고리 검증", "현재 서버 기준", "복사·붙여넣기는 Excel의 입력 제한을 우회할 수 있습니다. 업로드 시 현재 기업의 사용 여부·상하위 관계·이름의 모호함을 다시 검증하며 오류가 있으면 등록되지 않습니다."]);
            guideRows.Add(["카테고리 이름", "상위별 구분", "다른 상위 아래의 같은 이름은 각각 구분합니다. 같은 상위 아래 이름이 중복되면 목록에서 제외되므로 분류 관리에서 구분해 주세요. 다른 행에는 영향을 주지 않습니다."]);
            guideRows.Add(["환산 예시", "10 × 5 × 20", "인박스 1개 = 10 EA / 아웃박스 1개 = 50 EA / 파레트 1개 = 1,000 EA. 각 환산 결과는 999,999,999 EA 이하입니다."]);
            guideRows.Add(["검증", "전체 오류 수정", "빈 행은 건너뜁니다. 필수 헤더·중복·분류·숫자 오류가 하나라도 있으면 전체 등록을 차단합니다. 수정 후 재업로드하세요."]);
            guideRows.Add(["예시 데이터", "등록 대상 아님", "아래 예시는 참고용입니다. 실제 데이터는 상품 등록 시트에 입력하세요. 상품코드·바코드는 실제 사용 값으로 바꿔 주세요."]);
            guideRows.Add(Headers);
            guideRows.Add(["비쵸비 오리지널", "", "완제품", "식품·음료", "식품", "가공식품", "BCH-001", "국내산", "5000", "3000", "100", "10", "5", "인박스", "20", "8801111111111", "8802222222222", "8803333333333", "8804444444444", "상온 보관"]);
            guideRows.Add(["초코바", "PRD-EXAMPLE-02", "완제품", "식품·음료", "식품", "가공식품", "CHO-002", "국내산", "2000", "1000", "0", "", "12", "낱개", "10", "0012345678901", "", "0012345678902", "0012345678903", "인박스 없는 상품 예시"]);
            var guide = Sheet(guideRows, [30, 26, 96, 25, 25, 25, 22, 18, 18, 18, 18, 18, 18, 20, 24, 26, 26, 26, 26, 40]);
            foreach (var row in guide.Root!.Element(Ns + "sheetData")!.Elements()) { row.SetAttributeValue("ht", 48); row.SetAttributeValue("customHeight", 1); }
            Put(zip, "xl/worksheets/sheet2.xml", guide);
        }
        return file.ToArray();
    }

    static async IAsyncEnumerable<object?[]> Empty() { await Task.CompletedTask; yield break; }
    static XElement Cell(int row, int col, string value, int style) => new(Ns + "c", new XAttribute("r", $"{(char)('A' + col - 1)}{row}"), new XAttribute("t", "inlineStr"), new XAttribute("s", style), new XElement(Ns + "is", new XElement(Ns + "t", value)));
    static XDocument Sheet(IEnumerable<string[]> rows, int[] widths) => new(new XElement(Ns + "worksheet",
        new XElement(Ns + "sheetViews", new XElement(Ns + "sheetView", new XAttribute("workbookViewId", 0), new XElement(Ns + "pane", new XAttribute("ySplit", 1), new XAttribute("topLeftCell", "A2"), new XAttribute("activePane", "bottomLeft"), new XAttribute("state", "frozen")))),
        new XElement(Ns + "cols", widths.Select((width, i) => new XElement(Ns + "col", new XAttribute("min", i + 1), new XAttribute("max", i + 1), new XAttribute("width", width), new XAttribute("customWidth", 1)))),
        new XElement(Ns + "sheetData", rows.Select((row, i) => new XElement(Ns + "row", new XAttribute("r", i + 1), new XAttribute("ht", 30), new XAttribute("customHeight", 1), row.Select((v, j) => Cell(i + 1, j + 1, v, i == 0 ? 1 : 0)))))));
    static XElement Validation(string range, string type, string formula) => new(Ns + "dataValidation", new XAttribute("type", type), new XAttribute("sqref", range), new XAttribute("allowBlank", 1), new XAttribute("showErrorMessage", 1), new XAttribute("errorStyle", "stop"), new XAttribute("errorTitle", "선택값 확인"), new XAttribute("error", "목록에서 사용 가능한 값을 선택해 주세요."), new XElement(Ns + "formula1", formula));
    const string Styles = """
    <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <fonts count="2"><font><sz val="11"/><color rgb="FF172B4D"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font></fonts>
      <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172B4D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9F313B"/><bgColor indexed="64"/></patternFill></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="6">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
        <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
        <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
        <xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
        <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
      </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
      <dxfs count="1"><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs>
    </styleSheet>
    """;
}
