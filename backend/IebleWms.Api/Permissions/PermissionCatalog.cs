using IebleWms.Api.Models;

namespace IebleWms.Api.Permissions;

public sealed record PermissionFeature(string Key, string Label, string[] Actions, bool Business = true);
public static class PermissionCatalog
{
    public static readonly string[] EditableRoles = ["Administrator", "Employee"];
    public static readonly PermissionFeature[] Features = [
        new("dashboard", "대시보드", ["menu", "read"]),
        new("warehouses", "창고관리", ["menu", "read", "create", "update", "delete"]),
        new("products", "상품관리", ["menu", "read", "create", "update", "delete"]),
        new("receipts", "입고관리", ["menu", "read", "create", "update", "delete", "confirm"]),
        new("shipments", "출고관리", ["menu", "read", "create", "update", "delete", "confirm"]),
        new("stock-adjustments", "재고 이동 및 조정", ["menu", "read", "move", "adjust"]),
        new("stocktake", "재고 실사", ["menu", "read", "create", "update", "delete", "count"]),
        new("partners", "거래처관리", ["menu", "read", "create", "update", "delete"]),
        new("stock-overview", "재고 현황", ["menu", "read"]),
        new("movement-stats", "입출고 통계", ["menu", "read"]),
        new("stock-history", "재고 변동 이력", ["menu", "read"]),
        new("support", "문의하기", ["menu", "read"], false),
        new("company", "기업 관리", ["menu", "read", "update"], false),
        new("users", "사용자 관리", ["menu", "read", "create", "update", "delete", "manageUsers"], false)
    ];
    // Preserve existing page access; employees receive read-only business access by default.
    public static Dictionary<string, Dictionary<string, string[]>> Defaults() => EditableRoles.ToDictionary(role => role,
        role => Features.ToDictionary(f => f.Key, f => role == "Administrator" ? f.Actions.ToArray() :
            f.Key is "company" or "users" ? [] : new[] { "menu", "read" }));

    public static bool IsValid(Dictionary<string, Dictionary<string, string[]>>? roles)
    {
        if (roles is null || roles.Count != EditableRoles.Length || EditableRoles.Any(r => !roles.ContainsKey(r))) return false;
        foreach (var permissions in roles.Values)
        {
            if (permissions is null || permissions.Count != Features.Length) return false;
            foreach (var feature in Features)
            {
                if (!permissions.TryGetValue(feature.Key, out var actions) || actions is null || actions.Distinct().Count() != actions.Length || actions.Except(feature.Actions).Any()) return false;
                if (actions.Length > 0 && (!actions.Contains("menu") || !actions.Contains("read"))) return false;
                if (feature.Key == "users" && actions.Except(["menu", "read"]).Any() && !actions.Contains("manageUsers")) return false;
            }
        }
        return true;
    }
}
