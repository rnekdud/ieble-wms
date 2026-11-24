using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PartnerShipmentShippingAddresses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultShippingAddress",
                table: "Partners",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultShippingAddressDetail",
                table: "Partners",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShippingAddress",
                table: "OutboundShipments",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShippingAddressDetail",
                table: "OutboundShipments",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultShippingAddress",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "DefaultShippingAddressDetail",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "ShippingAddress",
                table: "OutboundShipments");

            migrationBuilder.DropColumn(
                name: "ShippingAddressDetail",
                table: "OutboundShipments");
        }
    }
}
