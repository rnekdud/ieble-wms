using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
using Microsoft.EntityFrameworkCore;

namespace IebleWms.Api.Warehousing;

internal static class RackBarcodePolicy
{
    public static void Validate(RackBarcodeChange? change) => IebleWms.Api.Barcodes.BarcodeChangePolicy.Validate(change, "랙 바코드");

    public static async Task Apply(WmsDbContext db, RackBarcodeCandidates candidates, WarehouseRack rack, RackBarcodeChange? change, bool creating, CancellationToken ct)
    {
        Validate(change);
        var mode = change?.Mode ?? (creating ? "auto" : "keep");
        if (mode == "keep") return;
        var previous = rack.BarcodeRegistration;
        if (mode == "none")
        {
            if (previous != null) { db.StorageBarcodes.Remove(previous); rack.BarcodeRegistration = null; }
            return;
        }
        string value;
        if (mode == "auto")
        {
            if (change?.Value != null)
            {
                value = change.Value;
                candidates.Verify(rack.TenantId, value, change.Proof);
                if (await db.StorageBarcodes.AnyAsync(x => x.Value == value && x.Id != (previous == null ? Guid.Empty : previous.Id), ct))
                    throw new OrganizationException(409, "생성한 바코드를 사용할 수 없습니다. 새 값을 생성해 주세요.");
            }
            else value = await RackBarcodeCandidates.NewValue(db, ct); // Older clients generating at save remain supported.
        }
        else value = change!.Value!; // Exact scanner data: never trim, case-fold, or Unicode-normalize.
        if (await db.StorageBarcodes.AnyAsync(x => x.TenantId == rack.TenantId && x.Value == value && x.Id != (previous == null ? Guid.Empty : previous.Id), ct))
            throw new OrganizationException(409, "현재 기업에서 이미 사용 중인 바코드입니다. 상품·랙·보관 위치 바코드는 중복될 수 없습니다.");
        if (previous?.Value == value) return;
        if (previous == null)
        {
            previous = new StorageBarcode { TenantId = rack.TenantId, WarehouseId = rack.WarehouseId, RackId = rack.Id };
            db.StorageBarcodes.Add(previous); rack.BarcodeRegistration = previous;
        }
        previous.Value = value; previous.IsGenerated = mode == "auto";
    }
}
