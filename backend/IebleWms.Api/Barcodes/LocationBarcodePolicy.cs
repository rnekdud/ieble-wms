using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;
namespace IebleWms.Api.Barcodes;
internal static class LocationBarcodePolicy
{
 public static async Task Apply(WmsDbContext db,InternalBarcodeCandidates candidates,StorageLocation location,RackBarcodeChange? change,CancellationToken ct)
 {
  BarcodeChangePolicy.Validate(change,"보관 위치 바코드");var mode=change?.Mode??"keep";if(mode=="keep")return;
  if(mode=="auto") { if(change?.Value==null)throw new OrganizationException(400,"자동 생성 후 저장해 주세요.");candidates.Verify(location.TenantId,"location",change.Value,change.Proof); }
  var previous=location.BarcodeRegistration;
  if(mode=="none"){if(previous!=null){db.StorageBarcodes.Remove(previous);location.BarcodeRegistration=null;}return;}
  var value=change!.Value!;
  if(await db.StorageBarcodes.AnyAsync(x=>x.TenantId==location.TenantId&&x.Value==value&&(x.LocationId==null||x.LocationId!=location.Id),ct))throw new OrganizationException(409,"현재 기업에서 상품·랙·보관 위치에 이미 사용 중인 바코드입니다.");
  if(mode=="auto"&&await db.StorageBarcodes.AnyAsync(x=>x.Value==value&&(x.LocationId==null||x.LocationId!=location.Id),ct))throw new OrganizationException(409,"생성한 바코드를 사용할 수 없습니다. 새 값을 생성해 주세요.");
  if(previous==null){previous=new(){TenantId=location.TenantId,WarehouseId=location.WarehouseId,LocationId=location.Id};db.StorageBarcodes.Add(previous);location.BarcodeRegistration=previous;}
  previous.IsGenerated=mode=="auto" || (previous.Value==value && previous.IsGenerated);previous.Value=value;
 }
}
