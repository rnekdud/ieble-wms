using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ShipmentPlannedRack : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PlannedRackId",
                table: "OutboundShipmentLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PlannedRackWarehouseId",
                table: "OutboundShipmentLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipmentLines_TenantId_PlannedRackWarehouseId_Plann~",
                table: "OutboundShipmentLines",
                columns: new[] { "TenantId", "PlannedRackWarehouseId", "PlannedRackId" });

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundShipmentLines_WarehouseRacks_TenantId_PlannedRackWa~",
                table: "OutboundShipmentLines",
                columns: new[] { "TenantId", "PlannedRackWarehouseId", "PlannedRackId" },
                principalTable: "WarehouseRacks",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OutboundShipmentLines_WarehouseRacks_TenantId_PlannedRackWa~",
                table: "OutboundShipmentLines");

            migrationBuilder.DropIndex(
                name: "IX_OutboundShipmentLines_TenantId_PlannedRackWarehouseId_Plann~",
                table: "OutboundShipmentLines");

            migrationBuilder.DropColumn(
                name: "PlannedRackId",
                table: "OutboundShipmentLines");

            migrationBuilder.DropColumn(
                name: "PlannedRackWarehouseId",
                table: "OutboundShipmentLines");
        }
    }
}
