using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductEaPackaging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PackageCode",
                table: "StorageBarcodes",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "EA");

            migrationBuilder.AddColumn<int>(
                name: "InnerPackQuantity",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OuterPackQuantity",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OuterPackUnit",
                table: "Products",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "INNER");

            migrationBuilder.AddColumn<int>(
                name: "PalletPackQuantity",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BarcodeSnapshotJson",
                table: "OutboundShipmentLines",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BarcodeSnapshotJson",
                table: "InboundReceiptLines",
                type: "text",
                nullable: true);
            // Freeze the pre-packaging one-scan/one-unit policy before any product settings change.
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
                foreach (var table in new[] { "InboundReceiptLines", "OutboundShipmentLines" })
                    migrationBuilder.Sql($"""
                    UPDATE "{table}" l SET "BarcodeSnapshotJson" = coalesce((
                      SELECT jsonb_agg(jsonb_build_object('Id',b."Id",'Value',b."Value",'Package','EA','Quantity',1) ORDER BY b."Id")::text
                      FROM "StorageBarcodes" b WHERE b."TenantId"=l."TenantId" AND b."ProductId"=l."ProductId"
                    ),'[]') WHERE l."BarcodeSnapshotJson" IS NULL;
                    """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PackageCode",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "InnerPackQuantity",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "OuterPackQuantity",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "OuterPackUnit",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PalletPackQuantity",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "BarcodeSnapshotJson",
                table: "OutboundShipmentLines");

            migrationBuilder.DropColumn(
                name: "BarcodeSnapshotJson",
                table: "InboundReceiptLines");
        }
    }
}
