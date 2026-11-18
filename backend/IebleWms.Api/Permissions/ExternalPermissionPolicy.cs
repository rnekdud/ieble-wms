using System.Text.Json;

namespace IebleWms.Api.Permissions;

// Allowlisted business grants shared by collaborator ceilings and optional personal restrictions.
// No inheritance from internal Employee/Administrator role defaults.
public static class ExternalPermissionPolicy
{
    public static PermissionFeature[] Features => PermissionCatalog.Features.Where(f => f.Business || f.Key == "support").ToArray();
    public static string[] Actions(PermissionFeature f) => PermissionCatalog.ActionsForRole(f, "Employee").Intersect(PermissionCatalog.ImplementedActions(f)).ToArray();
    public static Dictionary<string, string[]> Empty() => Features.ToDictionary(f => f.Key, _ => Array.Empty<string>());
    public static bool Valid(Dictionary<string, string[]>? grants) => grants != null && grants.Count == Features.Length && Features.All(f =>
        grants.TryGetValue(f.Key, out var actions) && actions != null && actions.Length == actions.Distinct().Count() && !actions.Except(Actions(f)).Any() &&
        (actions.Length == 0 || (actions.Contains("menu") && actions.Contains("read"))));
    public static Dictionary<string, string[]> Read(string json)
    {
        var result = Empty();
        try {
            var saved = JsonSerializer.Deserialize<Dictionary<string, string[]>>(json);
            if (saved != null) foreach (var f in Features) {
                if (saved.TryGetValue(f.Key, out var actions) && actions != null && actions.Contains("menu") && actions.Contains("read"))
                    result[f.Key] = Actions(f).Where(actions.Contains).ToArray();
            }
        } catch (JsonException) { /* Malformed grants fail closed. */ }
        return result;
    }
}
