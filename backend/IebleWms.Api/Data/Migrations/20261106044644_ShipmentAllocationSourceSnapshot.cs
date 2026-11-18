using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ShipmentAllocationSourceSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceLocationId",
                table: "ShipmentAllocations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceRackId",
                table: "ShipmentAllocations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceWarehouseId",
                table: "ShipmentAllocations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_TenantId_SourceWarehouseId_SourceLocati~",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "SourceWarehouseId", "SourceLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_TenantId_SourceWarehouseId_SourceRackId",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "SourceWarehouseId", "SourceRackId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ShipmentAllocations_StorageLocations_TenantId_SourceWarehou~",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "SourceWarehouseId", "SourceLocationId" },
                principalTable: "StorageLocations",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ShipmentAllocations_WarehouseRacks_TenantId_SourceWarehouse~",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "SourceWarehouseId", "SourceRackId" },
                principalTable: "WarehouseRacks",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ShipmentAllocations_StorageLocations_TenantId_SourceWarehou~",
                table: "ShipmentAllocations");

            migrationBuilder.DropForeignKey(
                name: "FK_ShipmentAllocations_WarehouseRacks_TenantId_SourceWarehouse~",
                table: "ShipmentAllocations");

            migrationBuilder.DropIndex(
                name: "IX_ShipmentAllocations_TenantId_SourceWarehouseId_SourceLocati~",
                table: "ShipmentAllocations");

            migrationBuilder.DropIndex(
                name: "IX_ShipmentAllocations_TenantId_SourceWarehouseId_SourceRackId",
                table: "ShipmentAllocations");

            migrationBuilder.DropColumn(
                name: "SourceLocationId",
                table: "ShipmentAllocations");

            migrationBuilder.DropColumn(
                name: "SourceRackId",
                table: "ShipmentAllocations");

            migrationBuilder.DropColumn(
                name: "SourceWarehouseId",
                table: "ShipmentAllocations");
        }
    }
}
