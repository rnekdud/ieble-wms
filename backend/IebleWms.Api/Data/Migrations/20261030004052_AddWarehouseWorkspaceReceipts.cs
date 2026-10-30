using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseWorkspaceReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WarehouseSaveReceipts",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResponseJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarehouseSaveReceipts", x => new { x.TenantId, x.RequestId });
                    table.ForeignKey(
                        name: "FK_WarehouseSaveReceipts_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WarehouseSaveReceipts_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseSaveReceipts_ActorId",
                table: "WarehouseSaveReceipts",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_WarehouseSaveReceipts_TenantId_WarehouseId",
                table: "WarehouseSaveReceipts",
                columns: new[] { "TenantId", "WarehouseId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WarehouseSaveReceipts");
        }
    }
}
