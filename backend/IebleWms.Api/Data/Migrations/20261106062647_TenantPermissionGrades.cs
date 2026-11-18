using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class TenantPermissionGrades : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PermissionGradeId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PermissionGrades",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SystemRole = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PermissionGrades", x => x.Id);
                    table.UniqueConstraint("AK_PermissionGrades_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_PermissionGrade_SystemRole", "\"SystemRole\" IS NULL OR \"SystemRole\" IN ('Administrator','Employee')");
                    table.ForeignKey(
                        name: "FK_PermissionGrades_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PermissionGrades_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PermissionGrades_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_PermissionGradeId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PermissionGradeId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_PermissionGrade",
                table: "TenantMemberships",
                sql: "\"PermissionGradeId\" IS NULL OR (\"AccountType\" = 'Internal' AND \"Role\" = 'Employee')");

            migrationBuilder.CreateIndex(
                name: "IX_PermissionGrades_CreatedByUserId",
                table: "PermissionGrades",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PermissionGrades_TenantId_NormalizedName",
                table: "PermissionGrades",
                columns: new[] { "TenantId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PermissionGrades_TenantId_SystemRole",
                table: "PermissionGrades",
                columns: new[] { "TenantId", "SystemRole" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PermissionGrades_UpdatedByUserId",
                table: "PermissionGrades",
                column: "UpdatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_PermissionGrades_TenantId_PermissionGrade~",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PermissionGradeId" },
                principalTable: "PermissionGrades",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_PermissionGrades_TenantId_PermissionGrade~",
                table: "TenantMemberships");

            migrationBuilder.DropTable(
                name: "PermissionGrades");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_PermissionGradeId",
                table: "TenantMemberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_PermissionGrade",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "PermissionGradeId",
                table: "TenantMemberships");
        }
    }
}
