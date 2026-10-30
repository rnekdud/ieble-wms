using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkWarehousePlanStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreationRequestHash",
                table: "WarehouseZones",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CreationRequestId",
                table: "WarehouseZones",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreationRequestHash",
                table: "WarehouseRacks",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CreationRequestId",
                table: "WarehouseRacks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ZoneId",
                table: "WarehousePlanObjects",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseZones_TenantId_WarehouseId_CreationRequestId",
                table: "WarehouseZones",
                columns: new[] { "TenantId", "WarehouseId", "CreationRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseRacks_TenantId_WarehouseId_CreationRequestId",
                table: "WarehouseRacks",
                columns: new[] { "TenantId", "WarehouseId", "CreationRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarehousePlanObjects_TenantId_WarehouseId_ZoneId",
                table: "WarehousePlanObjects",
                columns: new[] { "TenantId", "WarehouseId", "ZoneId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_PlanObjects_Zone",
                table: "WarehousePlanObjects",
                sql: "\"ZoneId\" IS NULL OR \"Type\" = 'zone'");

            migrationBuilder.AddForeignKey(
                name: "FK_WarehousePlanObjects_WarehouseZones_TenantId_WarehouseId_Zo~",
                table: "WarehousePlanObjects",
                columns: new[] { "TenantId", "WarehouseId", "ZoneId" },
                principalTable: "WarehouseZones",
                principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WarehousePlanObjects_WarehouseZones_TenantId_WarehouseId_Zo~",
                table: "WarehousePlanObjects");

            migrationBuilder.DropIndex(
                name: "IX_WarehouseZones_TenantId_WarehouseId_CreationRequestId",
                table: "WarehouseZones");

            migrationBuilder.DropIndex(
                name: "IX_WarehouseRacks_TenantId_WarehouseId_CreationRequestId",
                table: "WarehouseRacks");

            migrationBuilder.DropIndex(
                name: "IX_WarehousePlanObjects_TenantId_WarehouseId_ZoneId",
                table: "WarehousePlanObjects");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PlanObjects_Zone",
                table: "WarehousePlanObjects");

            migrationBuilder.DropColumn(
                name: "CreationRequestHash",
                table: "WarehouseZones");

            migrationBuilder.DropColumn(
                name: "CreationRequestId",
                table: "WarehouseZones");

            migrationBuilder.DropColumn(
                name: "CreationRequestHash",
                table: "WarehouseRacks");

            migrationBuilder.DropColumn(
                name: "CreationRequestId",
                table: "WarehouseRacks");

            migrationBuilder.DropColumn(
                name: "ZoneId",
                table: "WarehousePlanObjects");
        }
    }
}
