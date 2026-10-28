using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantApprovalAndAdminBootstrap : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants");

            migrationBuilder.CreateTable(
                name: "AdministratorBootstraps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdministratorBootstraps", x => x.Id);
                    table.CheckConstraint("CK_AdministratorBootstraps_Singleton", "\"Id\" = 1");
                    table.ForeignKey(
                        name: "FK_AdministratorBootstraps_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TenantStatusChanges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TenantStatusChanges", x => x.Id);
                    table.CheckConstraint("CK_TenantStatusChanges_Reason", "length(trim(\"Reason\")) > 0");
                    table.CheckConstraint("CK_TenantStatusChanges_Transition", "(\"FromStatus\" = 'PendingActivation' AND \"ToStatus\" IN ('Active', 'Rejected')) OR (\"FromStatus\" = 'Active' AND \"ToStatus\" = 'Suspended') OR (\"FromStatus\" = 'Suspended' AND \"ToStatus\" = 'Active')");
                    table.ForeignKey(
                        name: "FK_TenantStatusChanges_AspNetUsers_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TenantStatusChanges_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants",
                sql: "\"ServiceStatus\" IN ('PendingActivation', 'Active', 'Suspended', 'Rejected')");

            migrationBuilder.CreateIndex(
                name: "IX_AdministratorBootstraps_UserId",
                table: "AdministratorBootstraps",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantStatusChanges_ChangedByUserId",
                table: "TenantStatusChanges",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantStatusChanges_TenantId_Id",
                table: "TenantStatusChanges",
                columns: new[] { "TenantId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdministratorBootstraps");

            migrationBuilder.DropTable(
                name: "TenantStatusChanges");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants",
                sql: "\"ServiceStatus\" IN ('PendingActivation', 'Active', 'Suspended')");
        }
    }
}
