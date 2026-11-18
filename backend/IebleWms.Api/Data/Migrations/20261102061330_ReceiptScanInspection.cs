using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReceiptScanInspection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Barcode",
                table: "ReceiptChanges",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LineId",
                table: "ReceiptChanges",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PreviousQuantity",
                table: "ReceiptChanges",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Quantity",
                table: "ReceiptChanges",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reason",
                table: "ReceiptChanges",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScanRequestHash",
                table: "ReceiptChanges",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ScanRequestId",
                table: "ReceiptChanges",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptChanges_TenantId_ScanRequestId",
                table: "ReceiptChanges",
                columns: new[] { "TenantId", "ScanRequestId" },
                unique: true,
                filter: "\"ScanRequestId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ReceiptChanges_TenantId_ScanRequestId",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "Barcode",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "LineId",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "PreviousQuantity",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "Quantity",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "Reason",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "ScanRequestHash",
                table: "ReceiptChanges");

            migrationBuilder.DropColumn(
                name: "ScanRequestId",
                table: "ReceiptChanges");
        }
    }
}
