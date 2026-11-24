using System.Buffers.Binary;
using IebleWms.Api.Organization;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
namespace IebleWms.Api.Labels;
public static class LabelPdf {
 const double Pt=72/25.4;
 public static byte[] Create(LabelPdfRequest r){
  LabelValidation.Paper(r.Paper);LabelValidation.Offset(r.OffsetX,r.OffsetY);var p=r.Paper;var count=p.Columns*p.Rows;
  if(r.Labels==null||r.Labels.Length is <1 or >600||r.Labels.Any(l=>l==null||l.Index<0||l.Index>=count*20)||r.Labels.Select(l=>l.Index).Distinct().Count()!=r.Labels.Length||r.Labels.Sum(l=>(long)(l.Png?.Length??0))>24*1024*1024)throw new OrganizationException(400,"출력 대상과 이미지 용량을 확인해 주세요.");
  using var pdf=new PdfDocument();pdf.Info.Title="WMS Labels";
  foreach(var group in r.Labels.OrderBy(l=>l.Index).GroupBy(l=>l.Index/count)){
   var page=pdf.AddPage();page.Width=XUnit.FromMillimeter(p.Width);page.Height=XUnit.FromMillimeter(p.Height);using var g=XGraphics.FromPdfPage(page);
   foreach(var label in group){var slot=label.Index%count;var x=p.Left+slot%p.Columns*(p.LabelWidth+p.GapX)+r.OffsetX;var y=p.Top+slot/p.Columns*(p.LabelHeight+p.GapY)+r.OffsetY;
    if(x<0||y<0||x+p.LabelWidth>p.Width+.001||y+p.LabelHeight>p.Height+.001)throw new OrganizationException(400,"보정된 라벨이 용지 밖으로 나갑니다.");
    var bytes=LabelValidation.Image(label.Png,5*1024*1024,true);if(bytes.Length<24)throw new OrganizationException(400,"출력 이미지를 확인해 주세요.");var w=BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16,4));var h=BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20,4));
    if(w==0||h==0||(long)w*h>40000000L||w>10000||h>10000)throw new OrganizationException(400,"출력 이미지 해상도를 확인해 주세요.");
    try{using var stream=new MemoryStream(bytes,0,bytes.Length,false,true);using var image=XImage.FromStream(stream);g.DrawImage(image,x*Pt,y*Pt,p.LabelWidth*Pt,p.LabelHeight*Pt);}catch(OrganizationException){throw;}catch(Exception e) when(e is ArgumentException or InvalidOperationException or IOException or NotSupportedException){throw new OrganizationException(400,"손상된 출력 이미지입니다.");}
   }
  }
  using var output=new MemoryStream();pdf.Save(output,false);return output.ToArray();
 }
}
