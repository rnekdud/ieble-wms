using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReceiptPlannedRack : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PlannedRackId",
                table: "InboundReceiptLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PlannedRackWarehouseId",
                table: "InboundReceiptLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceiptLines_TenantId_PlannedRackWarehouseId_Planned~",
                table: "InboundReceiptLines",
                columns: new[] { "TenantId", "PlannedRackWarehouseId", "PlannedRackId" });

            migrationBuilder.AddForeignKey(
                name: "FK_InboundReceiptLines_WarehouseRacks_TenantId_PlannedRackWare~",
                table: "InboundReceiptLines",
                columns: new[] { "TenantId", "PlannedRackWarehouseId", "PlannedRackId" },
                principalTable: "WarehouseRacks",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InboundReceiptLines_WarehouseRacks_TenantId_PlannedRackWare~",
                table: "InboundReceiptLines");

            migrationBuilder.DropIndex(
                name: "IX_InboundReceiptLines_TenantId_PlannedRackWarehouseId_Planned~",
                table: "InboundReceiptLines");

            migrationBuilder.DropColumn(
                name: "PlannedRackId",
                table: "InboundReceiptLines");

            migrationBuilder.DropColumn(
                name: "PlannedRackWarehouseId",
                table: "InboundReceiptLines");
        }
    }
}
