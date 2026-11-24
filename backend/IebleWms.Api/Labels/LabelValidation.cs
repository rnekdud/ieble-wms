using System.Text.RegularExpressions;
using IebleWms.Api.Organization;
namespace IebleWms.Api.Labels;
public static partial class LabelValidation {
 static void Check([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool valid,string message){if(!valid)throw new OrganizationException(400,message);}
 public static void Paper(LabelPaper? p) {
  Check(p!=null,"용지 규격이 필요합니다.");var q=p!;
  Check(!string.IsNullOrWhiteSpace(q.Name)&&q.Name.Length<=100&&q.Id?.Length<=100&&q.Manufacturer?.Length<=100&&q.Code?.Length<=100&&q.Source?.Length is not >500,"용지 이름을 확인해 주세요.");
  Check(new[]{q.Width,q.Height,q.LabelWidth,q.LabelHeight,q.Left,q.Top,q.GapX,q.GapY}.All(double.IsFinite)&&q.Width is >=20 and <=600&&q.Height is >=20 and <=600&&q.LabelWidth>=5&&q.LabelHeight>=5&&q.Left>=0&&q.Top>=0&&q.GapX>=0&&q.GapY>=0&&q.Columns is >=1 and <=100&&q.Rows is >=1 and <=100&&q.Columns*q.Rows<=100,"용지 크기·여백·행과 열을 확인해 주세요.");
  Check(q.Left+q.Columns*q.LabelWidth+(q.Columns-1)*q.GapX<=q.Width+.001&&q.Top+q.Rows*q.LabelHeight+(q.Rows-1)*q.GapY<=q.Height+.001,"라벨 배열이 용지 영역을 벗어납니다.");
 }
 public static void Offset(double x,double y)=>Check(double.IsFinite(x)&&double.IsFinite(y)&&Math.Abs(x)<=10&&Math.Abs(y)<=10,"출력 보정값은 -10~10mm입니다.");
 public static byte[] Image(string? data,int maximum=2*1024*1024,bool pngOnly=false) {
  Check(data!=null&&data.Length<=maximum*4/3+100,"이미지 크기가 허용 범위를 초과했습니다.");var parts=data!.Split(',',2);Check(parts.Length==2,"이미지 형식을 확인해 주세요.");byte[] bytes;
  try{bytes=Convert.FromBase64String(parts[1]);}catch(FormatException){throw new OrganizationException(400,"이미지 인코딩을 확인해 주세요.");}
  Check(bytes.Length>12&&bytes.Length<=maximum,"이미지 크기를 확인해 주세요.");
  bool png=parts[0]=="data:image/png;base64"&&bytes.AsSpan().StartsWith(new byte[]{137,80,78,71,13,10,26,10});
  bool jpg=parts[0]=="data:image/jpeg;base64"&&bytes[0]==255&&bytes[1]==216&&bytes[^2]==255&&bytes[^1]==217;
  bool webp=parts[0]=="data:image/webp;base64"&&bytes.AsSpan(0,4).SequenceEqual("RIFF"u8)&&bytes.AsSpan(8,4).SequenceEqual("WEBP"u8);
  Check(png||( !pngOnly&&(jpg||webp)),"PNG·JPG·WebP 이미지만 저장할 수 있습니다.");return bytes;
 }
 [GeneratedRegex("^#[0-9a-fA-F]{6}$")] private static partial Regex Color();
 public static void Document(LabelDesignDocument? d,string kind) {
  Check(d!=null&&d.SchemaVersion==1,"지원하지 않는 라벨 문서 형식입니다.");var v=d!;Paper(v.Paper);Offset(v.OffsetX,v.OffsetY);
  Check(kind is "template" or "paper"&&v.Labels!=null&&v.Images!=null,"저장 유형을 확인해 주세요.");
  Check(v.Labels!.Length<=600&&v.Labels!.Length<=v.Paper.Columns*v.Paper.Rows*20&&v.Images!.Count<=32,"한 문서에 최대 20페이지·600칸·이미지 32개입니다.");
  Check(kind!="paper"||v.Labels.Length==0&&v.Images!.Count==0,"용지에는 디자인을 저장할 수 없습니다.");
  Check(kind!="template"||v.Labels.Length>0,"라벨이 필요합니다.");
  Check(v.Images!.Sum(x=>(long)(x.Value?.Length??0))<=12*1024*1024,"전체 이미지 용량은 9MB 이하로 줄여 주세요.");foreach(var image in v.Images){Check(image.Key.Length is >0 and <=100,"이미지 ID를 확인해 주세요.");Image(image.Value);}
  Check(v.Labels.All(l=>l?.Objects!=null&&l.Objects.Length<=100)&&v.Labels.Sum(l=>l.Objects.Length)<=3000,"라벨당 최대 100개·문서당 최대 3,000개 객체입니다.");
  foreach(var label in v.Labels){Check(label.Objects.All(o=>o!=null)&&label.Objects.Select(o=>o.Id).Distinct().Count()==label.Objects.Length,"객체 ID가 중복되었습니다.");foreach(var o in label.Objects){
   Check(!string.IsNullOrWhiteSpace(o.Id)&&o.Id.Length<=100&&o.Kind is "text" or "image" or "barcode" or "rectangle" or "line","객체 형식을 확인해 주세요.");
   Check(new[]{o.X,o.Y,o.Width,o.Height,o.Rotation,o.FontSize,o.StrokeWidth}.All(double.IsFinite)&&o.Width>=.2&&o.Height>=.2&&o.Rotation is >=-360 and <=360&&o.FontSize is >=4 and <=200&&o.StrokeWidth is >=0 and <=5,"객체 크기와 서식을 확인해 주세요.");
   Check(o.Text!=null&&o.Text.Length<=4000&&o.Font is "sans-serif" or "serif" or "monospace"&&o.Align is "left" or "center" or "right"&&o.Color!=null&&Color().IsMatch(o.Color)&&o.Fill!=null&&(o.Fill=="transparent"||Color().IsMatch(o.Fill)),"객체 텍스트와 색상을 확인해 주세요.");
   var a=o.Rotation*Math.PI/180;var w=Math.Abs(o.Width*Math.Cos(a))+Math.Abs(o.Height*Math.Sin(a));var h=Math.Abs(o.Width*Math.Sin(a))+Math.Abs(o.Height*Math.Cos(a));
   Check(o.X+o.Width/2-w/2>=-.01&&o.Y+o.Height/2-h/2>=-.01&&o.X+o.Width/2+w/2<=v.Paper.LabelWidth+.01&&o.Y+o.Height/2+h/2<=v.Paper.LabelHeight+.01,"객체가 라벨 영역을 벗어납니다.");
   if(o.Kind=="image")Check(o.ImageId!=null&&v.Images.ContainsKey(o.ImageId),"이미지가 누락되었습니다.");
   if(o.Kind=="barcode")Check(!string.IsNullOrWhiteSpace(o.Text)&&o.Text.Length<=64&&o.Text.All(c=>c is >= ' ' and <= '~'),"바코드는 ASCII 1~64자로 입력해 주세요.");
   if(o.Binding!=null)Check(o.Binding.ProductId!=Guid.Empty&&o.Binding.Field is "name" or "code" or "barcode" or "modelNumber"&&DateTimeOffset.TryParse(o.Binding.CapturedAt,out _),"상품 연결 정보를 확인해 주세요.");
  }}
 }
}
