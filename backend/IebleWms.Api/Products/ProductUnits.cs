namespace IebleWms.Api.Products;

public static class ProductUnits
{
    public static readonly string[] Codes = ["EA", "PCS", "SET", "PAIR", "DOZEN", "BOX", "PACK", "CTN", "PALLET", "ROLL", "BAG", "BUNDLE", "mg", "g", "kg", "ton", "oz", "lb", "ml", "L", "m³", "mm", "cm", "m", "㎡"];

    // Accept names sent by older clients, but persist only stable unit codes.
    public static string Normalize(string unit) => unit switch
    {
        "개" => "EA",
        "박스" => "BOX",
        _ => unit
    };
}
