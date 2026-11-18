using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IebleWms.Api.Barcodes;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Receiving;

public sealed partial class ReceiptService
{
    public static bool CanCountScan(string unit)=>unit is "EA" or "PCS" or "SET" or "PAIR" or "DOZEN" or "BOX" or "PACK" or "CTN" or "PALLET" or "ROLL" or "BAG" or "BUNDLE";
    static string ScanHash(string operation,Guid document,object request)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{operation,document,request}))));
    async Task<ReceiptChange?> ScanReplay(Guid tenant,Guid actor,Guid id,Guid requestId,string hash,CancellationToken ct)
    {
        if(requestId==Guid.Empty)throw Error("스캔 요청 번호를 확인해 주세요.");
        var existing=await db.ReceiptChanges.AsNoTracking().SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.ScanRequestId==requestId,ct);
        if(existing!=null&&(existing.ActorId!=actor||existing.ReceiptId!=id||existing.ScanRequestHash!=hash))throw Error("이미 사용한 요청 번호의 내용이 다릅니다.",409);
        return existing;
    }
    static object ScanResult(string outcome,InboundReceipt doc,List<InboundReceiptLine> lines,InboundReceiptLine? line=null,Guid[]? candidates=null,ReceiptChange? change=null,bool replayed=false)=>
        new{outcome,detail=new{receipt=doc,lines},lineId=line?.Id??change?.LineId,candidateLineIds=candidates??[],requestId=change?.ScanRequestId,replayed};
    public async Task<object> Scan(Guid tenant,Guid actor,Guid id,ReceiptScanRequest r,CancellationToken ct)
    {
        // Same lock as inspect/place/confirm/cancel. Reload AFTER acquiring it; never increment a stale client count.
        await using var tx=await Begin(tenant,ct);
        var doc=await Find(tenant,id,ct);var lines=await Lines(tenant,id,ct);var hash=ScanHash("scan",id,r);
        var replay=await ScanReplay(tenant,actor,id,r.RequestId,hash,ct);
        if(replay!=null){await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,change:replay,replayed:true);}
        State(doc,"Inspecting");if(doc.InspectedAt!=null)throw Error("검수가 확정되어 수량을 변경할 수 없습니다.",409);
        var label=await BarcodeRegistry.Find(db,tenant,r.Barcode,ct)??throw Error("등록되지 않은 상품 바코드입니다.",404);
        if(label.ProductId is not Guid productId)throw Error("랙·보관 위치 바코드는 상품 검수에 사용할 수 없습니다.");
        var matches=lines.Where(x=>x.ProductId==productId).ToArray();
        if(matches.Length==0)throw Error("현재 입고 문서에 포함되지 않은 상품입니다.");
        if(!await db.Products.AnyAsync(x=>x.TenantId==tenant&&x.Id==productId&&x.IsActive,ct))throw Error("사용 중지된 상품입니다.");
        if(r.LineId.HasValue&&!lines.Any(x=>x.Id==r.LineId))throw Error("현재 입고 문서의 검수 행을 선택해 주세요.");
        var line=r.GroupByProduct||matches.Length==1?matches[0]:matches.FirstOrDefault(x=>x.Id==r.LineId);
        if(line==null){await tx.CommitAsync(ct);return ScanResult("select-line",doc,lines,candidates:matches.Select(x=>x.Id).ToArray());}
        if(!CanCountScan(line.Unit)){await tx.CommitAsync(ct);return ScanResult("manual",doc,lines,line);}
        line.BarcodeSnapshotJson ??= await IebleWms.Api.Products.ProductPackaging.Capture(db,tenant,await db.Products.SingleAsync(p=>p.TenantId==tenant&&p.Id==productId,ct),ct);
        var increment=IebleWms.Api.Products.ProductPackaging.ScanFactor(line.BarcodeSnapshotJson,label,line.Unit);
        if(r.GroupByProduct) {
            foreach(var member in matches) {
                member.BarcodeSnapshotJson ??= await IebleWms.Api.Products.ProductPackaging.Capture(db,tenant,await db.Products.SingleAsync(p=>p.TenantId==tenant&&p.Id==productId,ct),ct);
                if(member.Unit!=line.Unit||IebleWms.Api.Products.ProductPackaging.ScanFactor(member.BarcodeSnapshotJson,label,member.Unit)!=increment)throw Error("동일 상품의 포장 환산 설정이 다릅니다. 실제 수량을 직접 입력해 주세요.");
            }
            var total=matches.Sum(l=>l.InspectedQuantity??0);
            if(total+increment>matches.Sum(l=>l.ExpectedQuantity)){await tx.CommitAsync(ct);return ScanResult("over-limit",doc,lines,line);}
            var groupChange=ChangeGroupQuantity(doc,actor,matches,total+increment,"BarcodeScanned",$"바코드 1회 · 상품 합계 +{increment} {line.Unit}",r.RequestId,hash,r.Barcode);
            await Save(ct);await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,line,change:groupChange);
        }
        var previous=line.InspectedQuantity??0;
        if(previous+increment>line.ExpectedQuantity){await tx.CommitAsync(ct);return ScanResult("over-limit",doc,lines,line);}
        var change=ChangeQuantity(doc,actor,line,previous+increment,"BarcodeScanned", $"바코드 1회 · 문서 보존 환산 {increment} {line.Unit}",r.RequestId,hash,r.Barcode);
        await Save(ct);await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,line,change:change);
    }
    public async Task<object> CorrectQuantity(Guid tenant,Guid actor,Guid id,ReceiptQuantityRequest r,CancellationToken ct)
    {
        await using var tx=await Begin(tenant,ct);var doc=await Find(tenant,id,ct);var lines=await Lines(tenant,id,ct);var hash=ScanHash("quantity",id,r);
        var replay=await ScanReplay(tenant,actor,id,r.RequestId,hash,ct);
        if(replay!=null){await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,change:replay,replayed:true);}
        State(doc,"Inspecting");if(doc.InspectedAt!=null)throw Error("검수가 확정되어 수량을 변경할 수 없습니다.",409);Version(doc,r.Version);
        var line=lines.SingleOrDefault(x=>x.Id==r.LineId)??throw Error("현재 입고 문서의 검수 행을 선택해 주세요.");
        if(string.IsNullOrWhiteSpace(r.Reason)||r.Reason.Length>500||r.Reason.Any(char.IsControl))throw Error("검수 수량 수정 사유를 500자 이내로 입력해 주세요.");
        if(r.GroupByProduct) {
            var groupChange=await CorrectGroupQuantity(doc,actor,lines.Where(l=>l.ProductId==line.ProductId).ToArray(),r,hash,ct);
            await Save(ct);await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,line,change:groupChange);
        }
        decimal quantity;var action="QuantityCorrected";
        if(r.UndoScanRequestId.HasValue){
            if(r.Quantity.HasValue)throw Error("되돌리기에는 수량을 함께 지정할 수 없습니다.");
            var scan=await db.ReceiptChanges.SingleOrDefaultAsync(x=>x.TenantId==tenant&&x.ReceiptId==id&&x.ScanRequestId==r.UndoScanRequestId&&x.LineId==line.Id&&x.Action=="BarcodeScanned",ct)??throw Error("되돌릴 스캔 기록이 없습니다.");
            // Do not undo across a subsequent count edit or line replacement. Never blindly subtract from new work.
            if(line.InspectedQuantity!=scan.Quantity||await db.ReceiptChanges.AnyAsync(x=>x.TenantId==tenant&&x.ReceiptId==id&&x.Id>scan.Id&&(x.LineId==line.Id||x.Action=="Inspected"||x.Action=="Updated"),ct))throw Error("이후 검수 변경이 있어 이 스캔을 되돌릴 수 없습니다. 수량 수정 기능을 사용해 주세요.",409);
            quantity=scan.PreviousQuantity??0;action="ScanUndone";
        }else quantity=r.Quantity??throw Error("검수 수량을 입력해 주세요.");
        Quantity(quantity,true);
        IebleWms.Api.Products.ProductPackaging.ValidateEach(quantity,line.Unit);
        if(quantity>line.ExpectedQuantity)throw Error("예정 수량을 초과했습니다.");
        if(line.Serials.Length>0&&decimal.Truncate(quantity)!=quantity)throw Error("시리얼이 있는 검수 수량은 정수로 입력해 주세요.");
        var change=ChangeQuantity(doc,actor,line,quantity,action,r.Reason.Trim(),r.RequestId,hash);
        await Save(ct);await tx.CommitAsync(ct);return ScanResult("applied",doc,lines,line,change:change);
    }
    ReceiptChange ChangeQuantity(InboundReceipt doc,Guid actor,InboundReceiptLine line,decimal quantity,string action,string reason,Guid requestId,string hash,string? barcode=null)
    {
        var previous=line.InspectedQuantity??0;
        var change=AddChange(doc,actor,action,new{lineId=line.Id,quantity=previous},new{lineId=line.Id,line.ProductId,line.ProductCode,line.LotNumber,line.ExpiryDate,quantity,reason});
        change.ScanRequestId=requestId;change.ScanRequestHash=hash;change.LineId=line.Id;change.PreviousQuantity=previous;change.Quantity=quantity;change.Barcode=barcode;change.Reason=reason;
        line.InspectedQuantity=quantity;line.Placements=[];doc.InspectedAt=null;doc.InspectedByUserId=null;
        // Tracking fields remain intact during partial scans. Existing final inspection validates serial count.
        return change;
    }
    public async Task<object> InspectionHistory(Guid tenant,Guid id,int page,CancellationToken ct)
    {
        await Find(tenant,id,ct);if(page<1||page>100000)throw Error("조회 페이지를 확인해 주세요.");
        var query=db.ReceiptChanges.AsNoTracking().Where(x=>x.TenantId==tenant&&x.ReceiptId==id);
        var total=await query.CountAsync(ct);
        var items=await (from h in query join u in db.Users on h.ActorId equals u.Id orderby h.Id descending select new{h.Id,h.Action,h.LineId,h.ScanRequestId,h.Barcode,h.PreviousQuantity,h.Quantity,h.Reason,h.CreatedAt,actor=u.DisplayName}).Skip((page-1)*30).Take(30).ToListAsync(ct);
        return new{items,total,page,pageSize=30};
    }
}
