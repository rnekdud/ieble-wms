using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class BusinessAssignees : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ContactUserId",
                table: "Warehouses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactUserId",
                table: "Stocktakes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContactName",
                table: "OutboundShipments",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactUserId",
                table: "OutboundShipments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "InventoryOperations",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactUserId",
                table: "InventoryOperations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ContactName",
                table: "InboundReceipts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactUserId",
                table: "InboundReceipts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_ContactUserId",
                table: "Warehouses",
                columns: new[] { "TenantId", "ContactUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_TenantId_ContactUserId",
                table: "Stocktakes",
                columns: new[] { "TenantId", "ContactUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_ContactUserId",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "ContactUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_ContactUserId",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "ContactUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_ContactUserId",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "ContactUserId" });

            migrationBuilder.AddForeignKey(
                name: "FK_InboundReceipts_TenantMemberships_TenantId_ContactUserId",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "ContactUserId" },
                principalTable: "TenantMemberships",
                principalColumns: new[] { "TenantId", "UserId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryOperations_TenantMemberships_TenantId_ContactUserId",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "ContactUserId" },
                principalTable: "TenantMemberships",
                principalColumns: new[] { "TenantId", "UserId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundShipments_TenantMemberships_TenantId_ContactUserId",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "ContactUserId" },
                principalTable: "TenantMemberships",
                principalColumns: new[] { "TenantId", "UserId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Stocktakes_TenantMemberships_TenantId_ContactUserId",
                table: "Stocktakes",
                columns: new[] { "TenantId", "ContactUserId" },
                principalTable: "TenantMemberships",
                principalColumns: new[] { "TenantId", "UserId" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Warehouses_TenantMemberships_TenantId_ContactUserId",
                table: "Warehouses",
                columns: new[] { "TenantId", "ContactUserId" },
                principalTable: "TenantMemberships",
                principalColumns: new[] { "TenantId", "UserId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InboundReceipts_TenantMemberships_TenantId_ContactUserId",
                table: "InboundReceipts");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryOperations_TenantMemberships_TenantId_ContactUserId",
                table: "InventoryOperations");

            migrationBuilder.DropForeignKey(
                name: "FK_OutboundShipments_TenantMemberships_TenantId_ContactUserId",
                table: "OutboundShipments");

            migrationBuilder.DropForeignKey(
                name: "FK_Stocktakes_TenantMemberships_TenantId_ContactUserId",
                table: "Stocktakes");

            migrationBuilder.DropForeignKey(
                name: "FK_Warehouses_TenantMemberships_TenantId_ContactUserId",
                table: "Warehouses");

            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_ContactUserId",
                table: "Warehouses");

            migrationBuilder.DropIndex(
                name: "IX_Stocktakes_TenantId_ContactUserId",
                table: "Stocktakes");

            migrationBuilder.DropIndex(
                name: "IX_OutboundShipments_TenantId_ContactUserId",
                table: "OutboundShipments");

            migrationBuilder.DropIndex(
                name: "IX_InventoryOperations_TenantId_ContactUserId",
                table: "InventoryOperations");

            migrationBuilder.DropIndex(
                name: "IX_InboundReceipts_TenantId_ContactUserId",
                table: "InboundReceipts");

            migrationBuilder.DropColumn(
                name: "ContactUserId",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "ContactUserId",
                table: "Stocktakes");

            migrationBuilder.DropColumn(
                name: "ContactUserId",
                table: "OutboundShipments");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "InventoryOperations");

            migrationBuilder.DropColumn(
                name: "ContactUserId",
                table: "InventoryOperations");

            migrationBuilder.DropColumn(
                name: "ContactUserId",
                table: "InboundReceipts");

            migrationBuilder.AlterColumn<string>(
                name: "ContactName",
                table: "OutboundShipments",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "ContactName",
                table: "InboundReceipts",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);
        }
    }
}
