using System.Globalization;
namespace IebleWms.Api.Reports;

public sealed record DocumentColumn(string Title, double Width);
public sealed record DocumentTable(string Title, DocumentColumn[] Columns, List<object?[]> Rows)
{
    public Dictionary<int, string> Details { get; } = [];
}
public sealed record BusinessDocument(string Kind, string Title, string Number, DateTimeOffset GeneratedAt,
    string Issuer, List<(string Label, object? Value)> Information, List<DocumentTable> Tables, List<string> Notes)
{
    public string Language { get; init; } = "ko";
    public BusinessDocumentLanguage Words => new(Language, Kind);
    public string FileName(string format) => $"{Words.FileStem}_{Safe(Number)}_{(Words.IsEnglish ? "EN" : "KO")}.{format}";
    static string Safe(string value) => string.Concat(value.Select(c => char.IsControl(c) || "/\\:*?\"<>|".Contains(c) ? '_' : c));
    public static string Text(object? value) => value switch {
        null => "-", DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTimeOffset date => date.ToOffset(TimeSpan.FromHours(9)).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        decimal number => number.ToString("#,##0.###", CultureInfo.InvariantCulture),
        _ => string.IsNullOrWhiteSpace(value.ToString()) ? "-" : value.ToString()!
    };
}
