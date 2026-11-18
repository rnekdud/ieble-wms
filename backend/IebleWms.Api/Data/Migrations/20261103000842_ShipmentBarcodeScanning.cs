using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ShipmentBarcodeScanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AllocationId",
                table: "ShipmentChanges",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Barcode",
                table: "ShipmentChanges",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PreviousQuantity",
                table: "ShipmentChanges",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Quantity",
                table: "ShipmentChanges",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScanRequestHash",
                table: "ShipmentChanges",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ScanRequestId",
                table: "ShipmentChanges",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentChanges_TenantId_ScanRequestId",
                table: "ShipmentChanges",
                columns: new[] { "TenantId", "ScanRequestId" },
                unique: true,
                filter: "\"ScanRequestId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ShipmentChanges_TenantId_ScanRequestId",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "AllocationId",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "Barcode",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "PreviousQuantity",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "Quantity",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "ScanRequestHash",
                table: "ShipmentChanges");

            migrationBuilder.DropColumn(
                name: "ScanRequestId",
                table: "ShipmentChanges");
        }
    }
}
