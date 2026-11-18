using System.Security.Cryptography;
using System.Text;
using IebleWms.Api.Models;

namespace IebleWms.Api.Products;

/// <summary>Versioned system catalog. Stable keys must never be renamed or reassigned.</summary>
public static class DefaultProductClassification
{
    public sealed record Category(string Key, string Name, string? Parent);
    public static readonly Category[] Categories = [
        new("food", "식품·음료", null),
        new("food.foodstuff", "식품", "food"),
        new("food.foodstuff.1", "가공식품", "food.foodstuff"),
        new("food.foodstuff.2", "냉장·냉동식품", "food.foodstuff"),
        new("food.drink", "음료", "food"),
        new("food.drink.1", "비알코올음료", "food.drink"),
        new("food.drink.2", "주류", "food.drink"),
        new("food.ingredient", "식재료", "food"),
        new("food.ingredient.1", "원재료", "food.ingredient"),
        new("food.ingredient.2", "조미·첨가재", "food.ingredient"),
        new("fashion", "의류·패션", null),
        new("fashion.clothes", "의류", "fashion"),
        new("fashion.clothes.1", "상의", "fashion.clothes"),
        new("fashion.clothes.2", "하의", "fashion.clothes"),
        new("fashion.shoes", "신발", "fashion"),
        new("fashion.shoes.1", "운동화", "fashion.shoes"),
        new("fashion.shoes.2", "일반 신발", "fashion.shoes"),
        new("fashion.accessory", "패션잡화", "fashion"),
        new("fashion.accessory.1", "가방", "fashion.accessory"),
        new("fashion.accessory.2", "액세서리", "fashion.accessory"),
        new("electronics", "전자·가전", null),
        new("electronics.appliance", "전자제품·가전", "electronics"),
        new("electronics.appliance.1", "소형가전", "electronics.appliance"),
        new("electronics.appliance.2", "정보통신기기", "electronics.appliance"),
        new("electronics.electronicparts", "전자부품·주변기기", "electronics"),
        new("electronics.electronicparts.1", "케이블", "electronics.electronicparts"),
        new("electronics.electronicparts.2", "센서·회로부품", "electronics.electronicparts"),
        new("home", "생활·가정", null),
        new("home.household", "생활용품", "home"),
        new("home.household.1", "청소용품", "home.household"),
        new("home.household.2", "생활잡화", "home.household"),
        new("home.kitchen", "주방·가구", "home"),
        new("home.kitchen.1", "조리도구", "home.kitchen"),
        new("home.kitchen.2", "가구", "home.kitchen"),
        new("beauty", "화장품·뷰티", null),
        new("beauty.skincare", "기초화장품", "beauty"),
        new("beauty.skincare.1", "크림·로션", "beauty.skincare"),
        new("beauty.skincare.2", "세정·보습", "beauty.skincare"),
        new("beauty.makeup", "색조·미용용품", "beauty"),
        new("beauty.makeup.1", "색조화장품", "beauty.makeup"),
        new("beauty.makeup.2", "헤어·미용도구", "beauty.makeup"),
        new("industry", "산업·제조", null),
        new("industry.material", "산업 원자재", "industry"),
        new("industry.material.1", "금속", "industry.material"),
        new("industry.material.2", "플라스틱·수지", "industry.material"),
        new("industry.industrialparts", "산업 부품·공구", "industry"),
        new("industry.industrialparts.1", "체결부품", "industry.industrialparts"),
        new("industry.industrialparts.2", "절삭·작업공구", "industry.industrialparts"),
        new("hygiene", "의료·위생", null),
        new("hygiene.hygieneitems", "위생용품", "hygiene"),
        new("hygiene.hygieneitems.1", "마스크", "hygiene.hygieneitems"),
        new("hygiene.hygieneitems.2", "위생장갑", "hygiene.hygieneitems"),
        new("hygiene.medicalsupplies", "의료소모품", "hygiene"),
        new("hygiene.medicalsupplies.1", "소독용품", "hygiene.medicalsupplies"),
        new("hygiene.medicalsupplies.2", "처치용품", "hygiene.medicalsupplies"),
        new("office", "사무·문구", null),
        new("office.stationery", "사무·문구용품", "office"),
        new("office.stationery.1", "종이·서류용품", "office.stationery"),
        new("office.stationery.2", "필기구", "office.stationery"),
        new("office.computersupply", "전산소모품", "office"),
        new("office.computersupply.1", "잉크·토너", "office.computersupply"),
        new("office.computersupply.2", "기록매체", "office.computersupply"),
        new("construction", "건축·설비", null),
        new("construction.building", "건축자재", "construction"),
        new("construction.building.1", "목재·보드", "construction.building"),
        new("construction.building.2", "마감재", "construction.building"),
        new("construction.equipment", "전기·배관자재", "construction"),
        new("construction.equipment.1", "전선·전기부속", "construction.equipment"),
        new("construction.equipment.2", "배관부속", "construction.equipment"),
        new("logistics", "물류·포장", null),
        new("logistics.packaging", "포장재", "logistics"),
        new("logistics.packaging.1", "박스·봉투", "logistics.packaging"),
        new("logistics.packaging.2", "완충재", "logistics.packaging"),
        new("logistics.storage", "물류·보관용품", "logistics"),
        new("logistics.storage.1", "팔레트", "logistics.storage"),
        new("logistics.storage.2", "보관용기", "logistics.storage"),
        new("mechanical", "자동차·기계", null),
        new("mechanical.autoparts", "자동차부품", "mechanical"),
        new("mechanical.autoparts.1", "차량 필터", "mechanical.autoparts"),
        new("mechanical.autoparts.2", "차량 소모부품", "mechanical.autoparts"),
        new("mechanical.machineparts", "기계부품", "mechanical"),
        new("mechanical.machineparts.1", "베어링", "mechanical.machineparts"),
        new("mechanical.machineparts.2", "모터·구동부품", "mechanical.machineparts"),
        new("other", "기타", null),
        new("other.general", "일반·미분류", "other"),
        new("other.general.1", "기타 품목", "other.general"),
    ];
    public static readonly string[] Types = ["완제품","반제품","원자재","부자재","부품","소모품","포장재","상품(매입·판매)","설비·자산","공구","샘플","기타"];
    public static Guid Id(Guid tenant, string key) => new(SHA256.HashData(Encoding.UTF8.GetBytes($"ieble-product-classification-v1:{tenant:D}:{key}"))[..16]);
    public static List<ProductCategory> CategoryRows(Guid tenant) => Categories.Select(c => new ProductCategory {
        Id = Id(tenant, "category:" + c.Key), TenantId = tenant, Name = c.Name,
        NormalizedName = "SYSTEM:" + c.Key.ToUpperInvariant(), ParentId = c.Parent == null ? null : Id(tenant, "category:" + c.Parent), IsActive = true
    }).ToList();
    public static List<ProductType> TypeRows(Guid tenant) => Types.Select((name, i) => new ProductType {
        Id = Id(tenant, "type:" + i), TenantId = tenant, Name = name, NormalizedName = "SYSTEM:TYPE:" + i, IsActive = true
    }).ToList();
    public static bool IsCategory(Guid tenant, Guid id) => Categories.Any(c => Id(tenant, "category:" + c.Key) == id);
    public static bool IsType(Guid tenant, Guid id) => Enumerable.Range(0, Types.Length).Any(i => Id(tenant, "type:" + i) == id);
}
