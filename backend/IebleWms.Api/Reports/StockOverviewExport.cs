using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Xml;
using IebleWms.Api.Contracts;
namespace IebleWms.Api.Reports;

// Sequential export to a private temporary file; bounded row count and concurrency are enforced by the endpoint.
public static partial class StockOverviewExport
{
 static readonly string[] Headers=["상품코드","상품명","상품 분류","창고","구역","랙","보관 위치","LOT","유통기한","시리얼","기준 단위","현재 재고","출고 예정","출고 가능","안전재고 (상품 전체)","전체 창고 출고 가능","재고 상태"];
 public static FileStream CreateTemporaryStream()
 {
  var options=new FileStreamOptions{Mode=FileMode.CreateNew,Access=FileAccess.ReadWrite,Share=FileShare.None,Options=FileOptions.DeleteOnClose|FileOptions.SequentialScan,BufferSize=65536};
  if(!OperatingSystem.IsWindows())options.UnixCreateMode=UnixFileMode.UserRead|UnixFileMode.UserWrite;
  return new FileStream(Path.Combine(Path.GetTempPath(),"ieble-stock-export-"+Guid.NewGuid().ToString("N")),options);
 }
 static object?[] Values(StockOverviewRow r)=>[r.ProductCode,r.ProductName,r.CategoryName,r.WarehouseName,r.ZoneName,r.RackCode,r.LocationCode,r.LotNumber,r.ExpiryDate?.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),r.SerialNumber,r.Unit,r.Quantity,r.ReservedQuantity,r.AvailableQuantity,r.SafetyComparable?r.SafetyStock:null,r.GlobalAvailableQuantity,string.Join(" · ",r.Statuses)];
 public static string SafeCsvText(string value)
 {
  var trimmed=value.TrimStart(' ','\t','\r','\n','\uFEFF');if(value.StartsWith('\t')||value.StartsWith('\r')||value.StartsWith('\n')||(trimmed.Length>0&&"=+-@".Contains(trimmed[0])))return "'"+value;return value;
 }
 static string Csv(object? value){var text=value is decimal or int or long?Convert.ToDecimal(value).ToString("0.###",CultureInfo.InvariantCulture):SafeCsvText(value?.ToString()??"");return "\""+text.Replace("\"","\"\"")+"\"";}
 public static Task Write(Stream file,IAsyncEnumerable<StockOverviewRow> rows,string format,CancellationToken ct)=>Write(file,rows,format,Headers,Values,"재고 현황",ct);
 public static async Task Write<T>(Stream file,IAsyncEnumerable<T> rows,string format,string[] headers,Func<T,object?[]> values,string sheetName,CancellationToken ct)
 {
  if(format=="csv"){
   await using var writer=new StreamWriter(file,new UTF8Encoding(true),65536,leaveOpen:true);await writer.WriteLineAsync(string.Join(",",headers.Select(x=>Csv(x))).AsMemory(),ct);
   await foreach(var row in rows.WithCancellation(ct))await writer.WriteLineAsync(string.Join(",",values(row).Select(Csv)).AsMemory(),ct);await writer.FlushAsync(ct);return;
  }
  using var zip=new ZipArchive(file,ZipArchiveMode.Create,true);
  Text(zip,"[Content_Types].xml","""
  <?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>
  """);
  Text(zip,"_rels/.rels","""
  <?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>
  """);
  Text(zip,"xl/workbook.xml",$$"""
  <?xml version="1.0" encoding="utf-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{{System.Security.SecurityElement.Escape(sheetName)}}" sheetId="1" r:id="rId1"/></sheets></workbook>
  """);
  Text(zip,"xl/_rels/workbook.xml.rels","""
  <?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>
  """);
  using var stream=zip.CreateEntry("xl/worksheets/sheet1.xml",CompressionLevel.Fastest).Open();using var xml=XmlWriter.Create(stream,new XmlWriterSettings{Encoding=new UTF8Encoding(false),CloseOutput=false});
  xml.WriteStartDocument();xml.WriteStartElement("worksheet","http://schemas.openxmlformats.org/spreadsheetml/2006/main");
  xml.WriteStartElement("sheetViews");xml.WriteStartElement("sheetView");xml.WriteAttributeString("workbookViewId","0");xml.WriteStartElement("pane");xml.WriteAttributeString("ySplit","1");xml.WriteAttributeString("topLeftCell","A2");xml.WriteAttributeString("activePane","bottomLeft");xml.WriteAttributeString("state","frozen");xml.WriteEndElement();xml.WriteEndElement();xml.WriteEndElement();
  xml.WriteStartElement("cols");xml.WriteStartElement("col");xml.WriteAttributeString("min","1");xml.WriteAttributeString("max",headers.Length.ToString());xml.WriteAttributeString("width","22");xml.WriteAttributeString("customWidth","1");xml.WriteEndElement();xml.WriteEndElement();
  xml.WriteStartElement("sheetData");var index=1;Row(xml,index++,headers.Cast<object?>().ToArray());await foreach(var row in rows.WithCancellation(ct))Row(xml,index++,values(row));xml.WriteEndElement();
  xml.WriteStartElement("autoFilter");xml.WriteAttributeString("ref",$"A1:{(char)('A'+headers.Length-1)}{index-1}");xml.WriteEndElement();xml.WriteEndElement();xml.WriteEndDocument();xml.Flush();
 }
 static void Text(ZipArchive zip,string name,string content){using var stream=zip.CreateEntry(name).Open();using var writer=new StreamWriter(stream,new UTF8Encoding(false));writer.Write(content);}
 static void Row(XmlWriter xml,int index,object?[] values)
 {
  xml.WriteStartElement("row");xml.WriteAttributeString("r",index.ToString(CultureInfo.InvariantCulture));
  for(var i=0;i<values.Length;i++){xml.WriteStartElement("c");xml.WriteAttributeString("r",$"{(char)('A'+i)}{index}");if(values[i] is decimal or int or long){xml.WriteElementString("v",Convert.ToDecimal(values[i]).ToString("0.###",CultureInfo.InvariantCulture));}else{xml.WriteAttributeString("t","inlineStr");xml.WriteStartElement("is");xml.WriteStartElement("t");xml.WriteAttributeString("xml","space","http://www.w3.org/XML/1998/namespace","preserve");var text=values[i]?.ToString()??"";xml.WriteString(new string(text.Where(c=>XmlConvert.IsXmlChar(c)||char.IsSurrogate(c)).ToArray()));xml.WriteEndElement();xml.WriteEndElement();}xml.WriteEndElement();}
  xml.WriteEndElement();
 }
}
