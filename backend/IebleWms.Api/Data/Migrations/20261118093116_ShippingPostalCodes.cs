using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ShippingPostalCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultShippingPostalCode",
                table: "Partners",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShippingPostalCode",
                table: "OutboundShipments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultShippingPostalCode",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "ShippingPostalCode",
                table: "OutboundShipments");
        }
    }
}
