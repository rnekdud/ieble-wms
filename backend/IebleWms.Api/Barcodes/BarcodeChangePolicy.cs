using IebleWms.Api.Contracts;
using IebleWms.Api.Organization;
namespace IebleWms.Api.Barcodes;

internal static class BarcodeChangePolicy
{
    public static void Validate(RackBarcodeChange? change, string label)
    {
        if (change == null) return;
        if (change.Mode is not ("keep" or "auto" or "manual" or "none")) throw new OrganizationException(400, "바코드 입력 방식을 확인해 주세요.");
        if ((change.Mode == "manual" || (change.Mode == "auto" && change.Value != null)) && (change.Value == null || change.Value.Length is < 1 or > 64 || string.IsNullOrWhiteSpace(change.Value) || change.Value.Any(c => c < 32 || c > 126)))
            throw new OrganizationException(400, $"{label}는 인쇄 가능한 영문·숫자·공백·기호(ASCII) 1~64자로 입력해 주세요. 공백만 있는 값·한글·제어문자는 지원하지 않습니다.");
        if (change.Mode is "keep" or "none" && !string.IsNullOrEmpty(change.Value)) throw new OrganizationException(400, "유지·미사용 방식에는 직접 입력값을 함께 보낼 수 없습니다.");
        if (change.Proof != null && (change.Mode != "auto" || change.Value == null || change.Proof.Length > 1024)) throw new OrganizationException(400, "자동 생성 요청을 확인해 주세요.");
    }

}
