using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LabelDesignTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LabelDesigns",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DocumentJson = table.Column<string>(type: "text", nullable: false),
                    PaperName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Thumbnail = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabelDesigns", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_LabelDesigns_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LabelDesigns_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LabelDesigns_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LabelDesigns_CreatedByUserId",
                table: "LabelDesigns",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_LabelDesigns_TenantId_Kind_IsActive_UpdatedAt",
                table: "LabelDesigns",
                columns: new[] { "TenantId", "Kind", "IsActive", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LabelDesigns_TenantId_RequestId",
                table: "LabelDesigns",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabelDesigns_UpdatedByUserId",
                table: "LabelDesigns",
                column: "UpdatedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LabelDesigns");
        }
    }
}
