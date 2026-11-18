using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeProductUnitCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products");

            // Rename unit identifiers only. Product IDs, quantities and audit history stay intact.
            migrationBuilder.Sql("""
                UPDATE "Products"
                SET "Unit" = CASE "Unit" WHEN '개' THEN 'EA' WHEN '박스' THEN 'BOX' END
                WHERE "Unit" IN ('개', '박스');
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products",
                sql: "\"Unit\" IN ('EA','BOX','kg','g','L','ml','m')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products");

            migrationBuilder.Sql("""
                UPDATE "Products" SET "Unit" = '박스' WHERE "Unit" = 'BOX';
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products",
                sql: "\"Unit\" IN ('개','EA','박스','kg','g','L','ml','m')");
        }
    }
}
