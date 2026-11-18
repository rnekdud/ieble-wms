using System.IO.Compression;
using System.Text;
using IebleWms.Api.Models;
using IebleWms.Api.Organization;
namespace IebleWms.Api.Support;

public static class SupportFiles
{
    public const int MaxBytes = 5 * 1024 * 1024, MaxCount = 3;
    public static async Task<List<SupportAttachment>> Read(IReadOnlyCollection<IFormFile> files, CancellationToken ct)
    {
        if (files.Count > MaxCount) throw new OrganizationException(400, "첨부파일은 최대 3개입니다.");
        var result = new List<SupportAttachment>();
        foreach (var file in files)
        {
            if (file.Length is <= 0 or > MaxBytes) throw new OrganizationException(400, "파일당 5MB 이하의 비어 있지 않은 파일을 선택해 주세요.");
            var name = Path.GetFileName(file.FileName.Replace('\\', '/'));
            if (name.Length is 0 or > 160 || name.Any(char.IsControl)) throw new OrganizationException(400, "파일명을 확인해 주세요. 최대 160자까지 가능합니다.");
            // Bound actual bytes too: do not trust multipart length or MIME supplied by the client.
            using var input = file.OpenReadStream(); using var output = new MemoryStream();
            var buffer = new byte[8192]; int n;
            while ((n = await input.ReadAsync(buffer, ct)) > 0) { if (output.Length + n > MaxBytes) throw new OrganizationException(400, "파일 크기가 5MB를 초과했습니다."); await output.WriteAsync(buffer.AsMemory(0,n), ct); }
            var bytes = output.ToArray(); var ext = Path.GetExtension(name).ToLowerInvariant(); string mime;
            bool valid;
            switch (ext)
            {
                case ".png": mime = "image/png"; valid = bytes.AsSpan().StartsWith(new byte[]{137,80,78,71,13,10,26,10}); break;
                case ".jpg": case ".jpeg": mime = "image/jpeg"; valid = bytes.Length > 4 && bytes[0] == 255 && bytes[1] == 216 && bytes[^2] == 255 && bytes[^1] == 217; break;
                case ".pdf": mime = "application/pdf"; valid = bytes.AsSpan().StartsWith("%PDF-"u8) && Encoding.ASCII.GetString(bytes.AsSpan(Math.Max(0,bytes.Length-1024))).Contains("%%EOF"); break;
                case ".txt": mime = "text/plain"; try { valid = !new UTF8Encoding(false,true).GetString(bytes).Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t')); } catch (DecoderFallbackException) { valid=false; } break;
                case ".docx": case ".xlsx": case ".pptx":
                    var kind = ext == ".docx" ? "wordprocessingml.document" : ext == ".xlsx" ? "spreadsheetml.sheet" : "presentationml.presentation";
                    mime = "application/vnd.openxmlformats-officedocument." + kind; valid = Office(bytes,ext); break;
                default: throw new OrganizationException(400, "PNG, JPG, PDF, TXT, DOCX, XLSX, PPTX 파일만 첨부할 수 있습니다.");
            }
            if (!valid) throw new OrganizationException(400, "파일 확장자와 실제 형식이 일치하지 않거나 지원하지 않는 문서입니다.");
            result.Add(new(){FileName=name,ContentType=mime,Content=bytes});
        }
        return result;
    }
    static bool Office(byte[] bytes,string ext)
    {
        try {
            using var zip = new ZipArchive(new MemoryStream(bytes),ZipArchiveMode.Read);
            if (zip.Entries.Count > 2000 || zip.Entries.Sum(x=>x.Length) > 20L*1024*1024) return false;
            if (zip.Entries.Any(x => x.FullName.Split('/','\\').Contains("..") || x.FullName.StartsWith('/') || new[]{"vba","activex","embeddings",".exe",".js",".html",".rels/"}.Any(v=>x.FullName.Contains(v,StringComparison.OrdinalIgnoreCase)))) return false;
            var main = ext == ".docx" ? "word/document.xml" : ext == ".xlsx" ? "xl/workbook.xml" : "ppt/presentation.xml";
            var types = zip.GetEntry("[Content_Types].xml"); if(types is null || types.Length>100000 || zip.GetEntry(main) is null)return false;
            using var reader = new StreamReader(types.Open()); var text = reader.ReadToEnd();
            return !text.Contains("macro",StringComparison.OrdinalIgnoreCase) && !text.Contains("vba",StringComparison.OrdinalIgnoreCase);
        } catch (InvalidDataException) { return false; }
    }
}
