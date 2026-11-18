using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Organization;

namespace IebleWms.Api.Warehousing;

// Short-lived, owner/tenant-scoped analysis scratch space. No business DB writes or external AI calls.
public sealed class PlanImportService(IWebHostEnvironment env, IConfiguration config) : BackgroundService
{
    public const long MaxBytes = 20 * 1024 * 1024;
    readonly ConcurrentDictionary<Guid, Job> jobs = new();
    readonly Dictionary<Guid, List<DateTimeOffset>> quotas = new();
    readonly object admission = new();
    readonly SemaphoreSlim workers = new(2);
    readonly string root = Path.Combine(env.ContentRootPath, "App_Data", "PlanImports", Guid.NewGuid().ToString("N"));
    readonly CancellationTokenSource stopping = new();
    static OrganizationException Error(string message, int status = 400) => new(status, message);
    public sealed class Job
    {
        public Guid Id { get; init; } = Guid.NewGuid();
        public Guid Tenant { get; init; }
        public Guid Owner { get; init; }
        public DateTimeOffset Expires { get; init; } = DateTimeOffset.UtcNow.AddMinutes(30);
        public string Directory { get; set; } = "";
        public string File { get; set; } = "";
        public string Name { get; init; } = "";
        public string State { get; set; } = "Uploading";
        public string? Error { get; set; }
        public string Preview { get; set; } = "";
        public int Page { get; set; }
        public int Rotation { get; set; }
        public int Revision { get; set; }
        public int Analyses { get; set; }
        public JsonElement? Metadata { get; set; }
        public object? Result { get; set; }
        public CancellationTokenSource Cancel { get; } = new();
        public Task Work { get; set; } = Task.CompletedTask;
    }
    Job Find(Guid tenant, Guid owner, Guid id) => jobs.TryGetValue(id, out var j) && j.Tenant == tenant && j.Owner == owner && j.Expires > DateTimeOffset.UtcNow
        ? j : throw Error("도면 분석 파일이 없거나 만료되었습니다. 다시 업로드하세요.", 404);
    public object Read(Guid tenant, Guid owner, Guid id) { var j = Find(tenant, owner, id); lock (j) return View(j); }
    static object View(Job j) => new { j.Id, fileName = j.Name, status = j.State, j.Error, j.Page, j.Rotation, j.Revision, expiresAt = j.Expires, metadata = j.Metadata, result = j.Result, externalAi = false, ocr = false };
    public async Task<object> Upload(Guid tenant, Guid owner, IFormFile file, CancellationToken ct)
    {
        if (file.Length is < 12 or > MaxBytes) throw Error("파일은 20MB 이하로 선택하세요.");
        var name = Path.GetFileName(file.FileName.Replace('\\', '/'));
        if (name.Length is 0 or > 160 || name.Any(char.IsControl)) throw Error("파일명을 확인하세요.");
        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (!new[] { ".pdf", ".png", ".jpg", ".jpeg", ".webp" }.Contains(ext)) throw Error("PDF, PNG, JPG, JPEG, WEBP만 지원합니다.");
        var j = new Job { Tenant = tenant, Owner = owner, Name = name };
        lock (admission) {
            if (jobs.Count >= 20 || jobs.Values.Count(x => x.Tenant == tenant && x.Owner == owner) >= 3) throw Error("열려 있는 도면 분석을 닫고 다시 시도하세요.", 429);
            var times = quotas.GetValueOrDefault(tenant) ?? []; times.RemoveAll(t => t < DateTimeOffset.UtcNow.AddHours(-1));
            if (times.Count >= 20) throw Error("기업당 시간당 20개 파일까지 분석할 수 있습니다.", 429);
            times.Add(DateTimeOffset.UtcNow); quotas[tenant] = times;
            j.Directory = Path.Combine(root, j.Id.ToString("N")); j.File = Path.Combine(j.Directory, "source" + ext); jobs[j.Id] = j;
        }
        try {
            Directory.CreateDirectory(j.Directory);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(j.Directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            using var input = file.OpenReadStream(); await using (var output = System.IO.File.Create(j.File)) {
                var buffer = new byte[81920]; long size = 0; int n;
                while ((n = await input.ReadAsync(buffer, ct)) > 0) { size += n; if (size > MaxBytes) throw Error("파일은 20MB 이하로 선택하세요."); await output.WriteAsync(buffer.AsMemory(0, n), ct); }
            }
            var header = new byte[12]; await using (var stream = System.IO.File.OpenRead(j.File)) await stream.ReadExactlyAsync(header, ct);
            var valid = ext switch { ".pdf" => header.AsSpan().StartsWith("%PDF-"u8), ".png" => header.AsSpan().StartsWith(new byte[] {137,80,78,71,13,10,26,10}), ".jpg" or ".jpeg" => header[0] == 255 && header[1] == 216, ".webp" => header.AsSpan(0,4).SequenceEqual("RIFF"u8) && header.AsSpan(8,4).SequenceEqual("WEBP"u8), _ => false };
            if (!valid) throw Error("확장자와 실제 파일 형식이 다릅니다.");
            lock(j) { j.State = "Inspecting"; j.Work = Run(j, false); return View(j); }
        } catch { jobs.TryRemove(j.Id, out _); Delete(j.Directory); throw; }
    }
    public object Page(Guid tenant, Guid owner, Guid id, int page, int rotation)
    {
        var j = Find(tenant, owner, id); lock (j) {
            Idle(j); if (j.Metadata == null || page < 0 || page >= j.Metadata.Value.GetProperty("pageCount").GetInt32() || rotation is not (0 or 90 or 180 or 270)) throw Error("페이지와 회전 방향을 확인하세요.");
            if (j.Revision >= 40) throw Error("파일당 페이지 미리보기는 최대 40회입니다.", 429);
            j.Page = page; j.Rotation = rotation; j.Result = null; j.Error = null; j.State = "Rendering"; j.Revision++; j.Work = Run(j, false); return View(j);
        }
    }
    public object Analyze(Guid tenant, Guid owner, Guid id)
    {
        var j = Find(tenant, owner, id); lock (j) {
            Idle(j); if (j.Metadata == null || j.Preview == "") throw Error("페이지 미리보기를 먼저 준비하세요.");
            if (++j.Analyses > 6) throw Error("파일당 최대 6회 분석할 수 있습니다.", 429);
            j.State = "Analyzing"; j.Error = null; j.Result = null; j.Work = Run(j, true); return View(j);
        }
    }
    static void Idle(Job j) { if (j.State is "Uploading" or "Inspecting" or "Rendering" or "Analyzing") throw Error("현재 파일 처리가 완료된 후 다시 시도하세요.", 409); }
    public byte[] Preview(Guid tenant, Guid owner, Guid id)
    {
        var j = Find(tenant, owner, id); lock(j) { if (j.Preview == "" || !System.IO.File.Exists(j.Preview)) throw Error("미리보기를 준비하고 있습니다.", 409); return System.IO.File.ReadAllBytes(j.Preview); }
    }
    public async Task Discard(Guid tenant, Guid owner, Guid id) { var j = Find(tenant, owner, id); jobs.TryRemove(id, out _); j.Cancel.Cancel(); await j.Work; Delete(j.Directory); }
    async Task Run(Job j, bool analyze)
    {
        // Yield before reading Job fields so callers atomically publish the task/status under the job lock.
        await Task.Yield();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(j.Cancel.Token, stopping.Token); timeout.CancelAfter(TimeSpan.FromSeconds(60));
        var acquired = false;
        try {
            await workers.WaitAsync(timeout.Token); acquired = true;
            var output = Path.Combine(j.Directory, $"preview-{j.Revision}.png");
            var parsed = await Engine(analyze ? "analyze" : "render", analyze ? j.Preview : j.File, output, j.Page, j.Rotation, timeout.Token);
            if (parsed.TryGetProperty("error", out _)) throw Error("파일을 해석하지 못했습니다. 손상·암호화·페이지·해상도를 확인하세요.");
            lock (j) {
                if (analyze) { j.Result = Validate(parsed); j.State = "Completed"; }
                else { var previous=j.Preview; j.Metadata = parsed; j.Preview = output; j.State = "Ready"; if(previous != "" && previous != output) System.IO.File.Delete(previous); }
            }
        } catch (OperationCanceledException) { lock(j) { j.State = "Failed"; j.Error = "분석 시간이 초과되었거나 취소됐습니다. 더 작은 도면으로 다시 시도하세요."; } }
        catch (OrganizationException e) { lock(j) { j.State = "Failed"; j.Error = e.Message; } }
        catch { lock(j) { j.State = "Failed"; j.Error = "로컬 분석 엔진을 사용할 수 없습니다. 관리자에게 분석 런타임 설치 상태를 확인해 달라고 요청하세요."; } }
        finally { if(acquired) workers.Release(); }
    }
    async Task<JsonElement> Engine(string mode, string input, string output, int page, int rotation, CancellationToken ct)
    {
        var directory = Path.GetFullPath(config["PlanImport:EngineDirectory"] ?? (Directory.Exists(Path.Combine(env.ContentRootPath,"plan-recognition")) ? Path.Combine(env.ContentRootPath,"plan-recognition") : Path.Combine(env.ContentRootPath, "..", "tools", "plan-recognition")));
        var python = config["PlanImport:PythonPath"] ?? Path.Combine(directory, ".venv", OperatingSystem.IsWindows() ? "Scripts/python.exe" : "bin/python");
        var start = new ProcessStartInfo(python) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        foreach(var arg in new[]{Path.Combine(directory,"recognize.py"),mode,input,output,page.ToString(),rotation.ToString()}) start.ArgumentList.Add(arg);
        start.Environment["OPENBLAS_NUM_THREADS"] = "1"; start.Environment["OMP_NUM_THREADS"] = "1";
        using var p = Process.Start(start) ?? throw Error("로컬 분석 엔진을 시작하지 못했습니다.", 503);
        using var cancel = ct.Register(() => { try { if(!p.HasExited) p.Kill(true); } catch(InvalidOperationException) { } });
        var stdout = p.StandardOutput.ReadToEndAsync(ct); var stderr = p.StandardError.ReadToEndAsync(ct);
        await p.WaitForExitAsync(ct); var text = await stdout; await stderr;
        if (text.Length > 1_000_000) throw Error("도면이 너무 복잡합니다. 필요한 부분만 잘라 업로드하세요.");
        if (string.IsNullOrWhiteSpace(text)) throw Error("로컬 분석 엔진이 준비되지 않았거나 파일을 처리하지 못했습니다.", 503);
        return JsonDocument.Parse(text).RootElement.Clone();
    }
    public static object Validate(JsonElement raw)
    {
        var ratio = raw.GetProperty("aspectRatio").GetDouble();
        if (!double.IsFinite(ratio) || ratio < .25 || ratio > 4 || raw.GetProperty("objects").GetArrayLength() > 500) throw Error("분석 결과의 좌표 범위가 올바르지 않습니다.");
        var items = new List<object>(); var index = 0;
        foreach(var value in raw.GetProperty("objects").EnumerateArray()) {
            // Explicit projection: engine fields cannot supply persisted IDs or model links.
            var o = new PlanObjectDto { Id=Guid.NewGuid(),Type=value.GetProperty("type").GetString()!,X=value.GetProperty("x").GetDouble(),Y=value.GetProperty("y").GetDouble(),Width=value.GetProperty("width").GetDouble(),Height=value.GetProperty("height").GetDouble(),Rotation=value.GetProperty("rotation").GetDouble(),Fill=value.GetProperty("fill").GetString()!,Label=$"{++index}번 후보" };
            if (!new[]{"wall","door","aisle","zone","rack","shape"}.Contains(o.Type) || !Validator.TryValidateObject(o,new ValidationContext(o),[],true) || new[]{o.X,o.Y,o.Width,o.Height,o.Rotation}.Any(n=>!double.IsFinite(n))) throw Error("지원하지 않거나 범위를 벗어난 인식 객체가 있습니다.");
            var confidence=value.GetProperty("confidence").GetDouble(); if(!double.IsFinite(confidence)||confidence<0||confidence>1)throw Error("인식 신뢰도 값이 올바르지 않습니다.");
            var evidence=value.GetProperty("evidence").GetString(); if(evidence?.Length>100)throw Error("인식 근거가 올바르지 않습니다.");
            items.Add(new { @object=o, confidence, evidence, reviewRequired=true });
        }
        return new { aspectRatio=ratio, candidates=items, engine="opencv-geometric-v1", externalAi=false, ocr=false, warnings=raw.GetProperty("warnings").EnumerateArray().Take(10).Select(w=>w.GetString()?.Substring(0,Math.Min(w.GetString()!.Length,500))).ToArray() };
    }
    static void Delete(string directory) { try { if(Directory.Exists(directory))Directory.Delete(directory,true); } catch(IOException) { } catch(UnauthorizedAccessException) { } }
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while(!ct.IsCancellationRequested) {
            foreach(var j in jobs.Values.Where(j=>j.Expires<=DateTimeOffset.UtcNow)) { jobs.TryRemove(j.Id,out _);j.Cancel.Cancel();await j.Work;Delete(j.Directory); }
            // Only this feature's scratch root; old process directories are retained at most 30 minutes after restart.
            var parent=Path.GetDirectoryName(root)!;
            if(Directory.Exists(parent))foreach(var d in Directory.EnumerateDirectories(parent).Where(d=>d!=root&&Directory.GetLastWriteTimeUtc(d)<DateTime.UtcNow.AddMinutes(-30)))Delete(d);
            try { await Task.Delay(TimeSpan.FromMinutes(1),ct); } catch(OperationCanceledException) { break; }
        }
    }
    public override async Task StopAsync(CancellationToken ct) { stopping.Cancel(); await Task.WhenAll(jobs.Values.Select(j=>j.Work)); Delete(root); await base.StopAsync(ct); }
}
