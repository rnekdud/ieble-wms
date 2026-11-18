using System.Buffers.Binary;
using IebleWms.Api.Contracts;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
namespace IebleWms.Api.Support;

public static class CompanyLogoFiles
{
    public const int MaxBytes = 2 * 1024 * 1024;
    public static async Task<CompanyLogo> Read(Guid tenant, CompanyLogoRequest request, CancellationToken ct)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(request.Base64 ?? ""); }
        catch (FormatException) { throw Invalid(); }
        if (bytes.Length is < 12 or > MaxBytes) throw Invalid();
        var name = Path.GetFileName((request.FileName ?? "").Replace('\\', '/'));
        if (name.Length is 0 or > 160 || name.Any(char.IsControl)) throw Invalid();
        var ext = Path.GetExtension(name).ToLowerInvariant();
        string mime;
        if (ext == ".webp")
        {
            mime = "image/webp";
            if (!WebP(bytes)) throw Invalid();
        }
        else
        {
            if (ext is not (".png" or ".jpg" or ".jpeg")) throw Invalid();
            using var stream = new MemoryStream(bytes);
            var image = (await SupportFiles.Read([new FormFile(stream, 0, bytes.Length, "logo", name)], ct))[0];
            mime = image.ContentType;
            if (ext == ".png" && !Png(bytes)) throw Invalid();
        }
        if (request.ContentType != mime) throw Invalid();
        return new() { TenantId = tenant, FileName = name, ContentType = mime, Content = bytes };
    }
    static bool Png(byte[] bytes)
    {
        if (bytes.Length < 45 || !bytes.AsSpan(12,4).SequenceEqual("IHDR"u8)) return false;
        var data = false;
        for (var offset=8; offset+12<=bytes.Length;)
        {
            var length=BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset,4));
            if (length > bytes.Length-offset-12) return false;
            var type=bytes.AsSpan(offset+4,4);
            if (offset==8 && (length!=13 || BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16,4)) is 0 or > 8192 || BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20,4)) is 0 or > 8192)) return false;
            if(type.SequenceEqual("IDAT"u8)) data=true;
            if(type.SequenceEqual("IEND"u8)) return data && length==0 && offset+12==bytes.Length;
            offset+=12+(int)length;
        }
        return false;
    }
    static bool WebP(byte[] bytes)
    {
        if (!bytes.AsSpan(0,4).SequenceEqual("RIFF"u8) || !bytes.AsSpan(8,4).SequenceEqual("WEBP"u8)
            || BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4,4)) != bytes.Length-8) return false;
        var image=false;
        for(var offset=12; offset+8<=bytes.Length;)
        {
            var size=BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset+4,4));
            if(size>bytes.Length-offset-8) return false;
            var kind=bytes.AsSpan(offset,4);
            if(kind.SequenceEqual("VP8 "u8)) {if(size<10 || !bytes.AsSpan(offset+11,3).SequenceEqual(new byte[]{0x9d,0x01,0x2a})) return false; image=true;}
            else if(kind.SequenceEqual("VP8L"u8)){if(size<5 || bytes[offset+8]!=0x2f)return false;image=true;}
            else if(kind.SequenceEqual("ANIM"u8)||kind.SequenceEqual("ANMF"u8)) return false;
            offset+=8+(int)size+(int)(size%2);
            if(offset==bytes.Length)return image;
        }
        return false;
    }
    static OrganizationException Invalid() => new(400, "기업 로고는 2MB 이하의 정상적인 PNG·JPG·WEBP 이미지로 등록해 주세요.");
}
