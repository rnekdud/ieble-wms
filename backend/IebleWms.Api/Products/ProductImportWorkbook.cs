using System.Globalization;
using System.IO.Compression;
using System.Xml;
using System.Xml.Linq;
using IebleWms.Api.Organization;
using IebleWms.Api.Reports;
namespace IebleWms.Api.Products;

public sealed record ProductImportError(int Row,string Column,string Value,string Message,string? ProductName=null,string? ProductCode=null);
public static partial class ProductImportWorkbook
{
    public static readonly string[] Headers=["상품명","상품코드","상품 구분","1차 카테고리","2차 카테고리","3차 카테고리","모델명","원산지","소비자가","매입단가","안전재고","인박스 수량","아웃박스 수량","아웃박스 구성","파레트당 아웃박스","낱개 바코드","인박스 바코드","아웃박스 바코드","파레트 바코드","비고"];
    static readonly XNamespace Ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    static readonly XNamespace Rel="http://schemas.openxmlformats.org/package/2006/relationships";
    static XDocument Load(ZipArchive zip,string name){var entry=zip.GetEntry(name)??throw new OrganizationException(400,"Excel 양식을 확인해 주세요.");using var stream=entry.Open();using var xml=XmlReader.Create(stream,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null,MaxCharactersInDocument=4000000});return XDocument.Load(xml);}
    static void Put(ZipArchive zip,string name,XDocument doc){zip.GetEntry(name)?.Delete();using var stream=zip.CreateEntry(name).Open();doc.Save(stream);}
    public static List<(int Row,string[] Values)> Read(string base64,List<ProductImportError> errors)
    {
        try {
            var bytes=Convert.FromBase64String(base64);if(bytes.Length>5000000)throw new OrganizationException(413,"파일은 5MB 이내로 업로드해 주세요.");
            using var file=new MemoryStream(bytes);using var zip=new ZipArchive(file,ZipArchiveMode.Read);
            if(zip.Entries.Count>100 || zip.Entries.Sum(e=>e.Length)>20000000)throw new OrganizationException(413,"압축 해제 크기 또는 파일 구조가 제한을 초과했습니다.");
            var workbook=Load(zip,"xl/workbook.xml");var sheet=workbook.Descendants(Ns+"sheet").SingleOrDefault(x=>(string?)x.Attribute("name")=="상품 등록")??throw new OrganizationException(400,"상품 등록 시트가 없습니다.");
            var id=(string?)sheet.Attribute(XName.Get("id","http://schemas.openxmlformats.org/officeDocument/2006/relationships"));
            var relationship=Load(zip,"xl/_rels/workbook.xml.rels").Descendants(Rel+"Relationship").Single(x=>(string?)x.Attribute("Id")==id);
            var target=(string?)relationship.Attribute("Target")??"";if(relationship.Attribute("TargetMode")!=null||target.Contains("..")||!target.EndsWith(".xml",StringComparison.Ordinal))throw new OrganizationException(400,"외부 참조 Excel 파일은 사용할 수 없습니다.");
            var path=target.StartsWith('/')?target.TrimStart('/') :"xl/"+target;
            var shared=zip.GetEntry("xl/sharedStrings.xml")==null?[]:Load(zip,"xl/sharedStrings.xml").Descendants(Ns+"si").Select(x=>string.Concat(x.Descendants(Ns+"t").Select(t=>t.Value))).ToArray();
            var output=new List<(int,string[])>();var seenRows=new HashSet<int>();
            var sheetRows=Load(zip,path).Descendants(Ns+"sheetData").Elements(Ns+"row").ToArray();
            var columnMap=new Dictionary<int,int>();
            foreach(var row in sheetRows.OrderBy(x=>(int?)x.Attribute("r")??0)) {
                if(!int.TryParse((string?)row.Attribute("r"),out var index)||index<1||!seenRows.Add(index))throw new OrganizationException(400,"Excel 행 번호를 확인해 주세요.");
                var values=new string[Headers.Length];Array.Fill(values,"");var used=new HashSet<int>();var hasContent=false;
                foreach(var cell in row.Elements(Ns+"c")) {
                    var reference=(string?)cell.Attribute("r")??"";var column=0;foreach(var ch in reference.TakeWhile(char.IsAsciiLetterUpper))column=checked(column*26+ch-'A'+1);
                    if(column<1||column>16384||!int.TryParse(reference.AsSpan(reference.TakeWhile(char.IsAsciiLetterUpper).Count()),out var cellRow)||cellRow!=index||!used.Add(column))throw new OrganizationException(400,"Excel 셀 위치 또는 중복 셀을 확인해 주세요.");
                    var text=(string?)cell.Element(Ns+"v")??string.Concat(cell.Descendants(Ns+"t").Select(x=>x.Value));
                    var cellType=(string?)cell.Attribute("t");
                    if(cellType=="s")text=int.TryParse(text,out var n)&&n>=0&&n<shared.Length?shared[n]:throw new OrganizationException(400,"문자열 참조를 확인해 주세요.");
                    text=text.Trim();hasContent|=text.Length>0||cell.Element(Ns+"f")!=null;
                    if(index==1) {
                        if(text.Length==0)continue;
                        var name=text.Replace(" (필수)","");var mapped=Array.IndexOf(Headers,name);
                        if(mapped<0)errors.Add(new(1,reference,text[..Math.Min(100,text.Length)],"지원하지 않는 헤더입니다. 공식 상품 등록 양식을 확인해 주세요."));
                        else if(columnMap.ContainsValue(mapped))errors.Add(new(1,name,text,"중복된 헤더입니다."));
                        else columnMap[column]=mapped;
                        if(cell.Element(Ns+"f")!=null)errors.Add(new(1,reference,text,"헤더에 수식을 사용할 수 없습니다."));
                        continue;
                    }
                    if(!columnMap.TryGetValue(column,out var col)) {if(text.Length>0||cell.Element(Ns+"f")!=null)errors.Add(new(index,reference,text[..Math.Min(100,text.Length)],"헤더가 없는 컬럼입니다."));continue;}
                    if(cell.Element(Ns+"f")!=null)errors.Add(new(index,Headers[col],text[..Math.Min(100,text.Length)],"수식 대신 값을 입력해 주세요."));
                    if(cellType=="e")errors.Add(new(index,Headers[col],text,"Excel 셀 오류를 수정해 주세요."));
                    if(col is >=15 and <=18 && text.Length>0 && cellType is not ("s" or "inlineStr" or "str"))errors.Add(new(index,Headers[col],text[..Math.Min(100,text.Length)],"바코드는 텍스트 형식으로 지정한 뒤 원본 값을 다시 입력해 주세요. 숫자 형식은 앞자리 0이나 긴 숫자가 손상될 수 있습니다."));
                    if(text.Length>2000){errors.Add(new(index,Headers[col],text[..100],"입력 길이를 초과했습니다."));text=text[..2000];}
                    values[col]=text;
                }
                if(index>1 && hasContent)output.Add((index,values));
                if(output.Count>500)throw new OrganizationException(413,"한 번에 최대 500개 상품을 등록할 수 있습니다.");
            }
            if(!seenRows.Contains(1)||!columnMap.ContainsValue(0))errors.Add(new(1,"상품명","","필수 헤더 '상품명'이 없습니다. 공식 양식의 첫 행을 확인해 주세요."));
            if(output.Count==0 && errors.Count==0)errors.Add(new(2,"상품명","","등록할 상품을 상품 등록 시트 2행부터 입력해 주세요."));
            return output.OrderBy(x=>x.Item1).ToList();
        }catch(OrganizationException e)when(e.StatusCode==400){errors.Add(new(0,"파일 구조","",e.Message));return [];}catch(Exception e)when(e is InvalidDataException or FormatException or XmlException or InvalidOperationException or OverflowException){errors.Add(new(0,"파일 구조","","유효한 .xlsx 상품 등록 양식을 업로드해 주세요."));return [];}
    }
}
