using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehousePlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WarehousePlans",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    SchemaVersion = table.Column<int>(type: "integer", nullable: false),
                    AspectRatio = table.Column<double>(type: "double precision", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehousePlans", x => new { x.TenantId, x.WarehouseId });
                    table.CheckConstraint("CK_WarehousePlans_Schema", "\"SchemaVersion\" = 1 AND \"AspectRatio\" BETWEEN 0.25 AND 4");
                    table.ForeignKey(
                        name: "FK_WarehousePlans_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehousePlans_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehousePlans_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WarehousePlanObjects",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    X = table.Column<double>(type: "double precision", nullable: false),
                    Y = table.Column<double>(type: "double precision", nullable: false),
                    Width = table.Column<double>(type: "double precision", nullable: false),
                    Height = table.Column<double>(type: "double precision", nullable: false),
                    Rotation = table.Column<double>(type: "double precision", nullable: false),
                    Fill = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Shape = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    RackId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehousePlanObjects", x => new { x.TenantId, x.WarehouseId, x.Id });
                    table.CheckConstraint("CK_PlanObjects_Geometry", "\"X\" BETWEEN 0 AND 1 AND \"Y\" BETWEEN 0 AND 1 AND \"Width\" BETWEEN 0.005 AND 1 AND \"Height\" BETWEEN 0.005 AND 1 AND \"Rotation\" BETWEEN -180 AND 180 AND \"SortOrder\" >= 0");
                    table.CheckConstraint("CK_PlanObjects_Type", "\"Type\" IN ('wall','zone','rack','aisle','door','text','shape') AND \"Shape\" IN ('rectangle','ellipse') AND (\"RackId\" IS NULL OR \"Type\" = 'rack')");
                    table.ForeignKey(
                        name: "FK_WarehousePlanObjects_StorageLocations_TenantId_WarehouseId_~",
                        columns: x => new { x.TenantId, x.WarehouseId, x.LocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehousePlanObjects_WarehousePlans_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "WarehousePlans",
                        principalColumns: new[] { "TenantId", "WarehouseId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehousePlanObjects_WarehouseRacks_TenantId_WarehouseId_Ra~",
                        columns: x => new { x.TenantId, x.WarehouseId, x.RackId },
                        principalTable: "WarehouseRacks",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarehousePlanObjects_TenantId_WarehouseId_LocationId",
                table: "WarehousePlanObjects",
                columns: new[] { "TenantId", "WarehouseId", "LocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_WarehousePlanObjects_TenantId_WarehouseId_RackId",
                table: "WarehousePlanObjects",
                columns: new[] { "TenantId", "WarehouseId", "RackId" });

            migrationBuilder.CreateIndex(
                name: "IX_WarehousePlans_CreatedByUserId",
                table: "WarehousePlans",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehousePlans_UpdatedByUserId",
                table: "WarehousePlans",
                column: "UpdatedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WarehousePlanObjects");

            migrationBuilder.DropTable(
                name: "WarehousePlans");
        }
    }
}
