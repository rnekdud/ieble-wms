using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStorageBarcodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StorageBarcodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    RackId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Value = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsGenerated = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageBarcodes", x => x.Id);
                    table.CheckConstraint("CK_StorageBarcodes_Length", "length(\"Value\") BETWEEN 1 AND 64");
                    table.CheckConstraint("CK_StorageBarcodes_Owner", "(\"RackId\" IS NOT NULL AND \"LocationId\" IS NULL) OR (\"RackId\" IS NULL AND \"LocationId\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_StorageBarcodes_StorageLocations_TenantId_WarehouseId_Locat~",
                        columns: x => new { x.TenantId, x.WarehouseId, x.LocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StorageBarcodes_WarehouseRacks_TenantId_WarehouseId_RackId",
                        columns: x => new { x.TenantId, x.WarehouseId, x.RackId },
                        principalTable: "WarehouseRacks",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_Value",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "Value" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_WarehouseId_LocationId",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "WarehouseId", "LocationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_WarehouseId_RackId",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "WarehouseId", "RackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_Value",
                table: "StorageBarcodes",
                column: "Value",
                unique: true,
                filter: "\"IsGenerated\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StorageBarcodes");
        }
    }
}
