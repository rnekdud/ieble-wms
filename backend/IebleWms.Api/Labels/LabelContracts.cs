using System.Text.Json.Serialization;
namespace IebleWms.Api.Labels;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LabelPaper {
 public string Id {get;set;}="custom"; public string Name {get;set;}=""; public string Manufacturer {get;set;}=""; public string Code {get;set;}=""; public string? Source {get;set;}
 public double Width {get;set;} public double Height {get;set;} public double LabelWidth {get;set;} public double LabelHeight {get;set;} public double Left {get;set;} public double Top {get;set;} public double GapX {get;set;} public double GapY {get;set;} public int Columns {get;set;} public int Rows {get;set;}
}
public sealed class LabelBinding { public Guid ProductId {get;set;} public string Field {get;set;}="";public string CapturedAt {get;set;}=""; }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LabelElement {
 public string Id {get;set;}=""; public string Kind {get;set;}="text";public double X {get;set;} public double Y {get;set;} public double Width {get;set;} public double Height {get;set;} public double Rotation {get;set;}
 public string Text {get;set;}=""; public string Font {get;set;}="sans-serif"; public double FontSize {get;set;}=10;public bool Bold {get;set;} public string Align {get;set;}="left"; public string Color {get;set;}="#000000";public string Fill {get;set;}="transparent"; public double StrokeWidth {get;set;}=.3;public string ImageId {get;set;}="";public bool ShowValue {get;set;}=true;public LabelBinding? Binding {get;set;}
}
public sealed class DesignLabel {public LabelElement[] Objects {get;set;}=[];}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LabelDesignDocument { public int SchemaVersion {get;set;}=1;public LabelPaper Paper {get;set;}=new();public DesignLabel[] Labels {get;set;}=[]; public Dictionary<string,string> Images {get;set;}=[];public double OffsetX {get;set;}public double OffsetY {get;set;} }
public sealed class SaveLabelDesign {public Guid RequestId {get;set;} public Guid Version {get;set;}public string Name {get;set;}="";public string Kind {get;set;}="template";public LabelDesignDocument Document {get;set;}=new(); public string? Thumbnail {get;set;} }
public sealed record LabelVersion(Guid Version);
public sealed class LabelPrintImage {public int Index {get;set;}public string Png {get;set;}="";}
public sealed class LabelPdfRequest {public LabelPaper Paper {get;set;}=new();public double OffsetX {get;set;} public double OffsetY {get;set;} public LabelPrintImage[] Labels {get;set;}=[];}
