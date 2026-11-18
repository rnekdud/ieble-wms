using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalCollaboratorMemberships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountType",
                table: "TenantMemberships",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Internal");

            migrationBuilder.AddColumn<string>(
                name: "BusinessRegistrationNumber",
                table: "TenantMemberships",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompanyName",
                table: "TenantMemberships",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompanyPhone",
                table: "TenantMemberships",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                table: "TenantMemberships",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                table: "TenantMemberships",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalPermissionsJson",
                table: "TenantMemberships",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<Guid>(
                name: "PartnerId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_AccountType_IsActive",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "AccountType", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_PartnerId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PartnerId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_AccountType",
                table: "TenantMemberships",
                sql: "\"AccountType\" IN ('Internal','External')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_External",
                table: "TenantMemberships",
                sql: "\"AccountType\" <> 'External' OR (\"Role\" = 'Employee' AND \"DepartmentId\" IS NULL AND \"PositionId\" IS NULL AND \"CompanyName\" IS NOT NULL AND length(trim(\"CompanyName\")) > 0)");

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_Partners_TenantId_PartnerId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PartnerId" },
                principalTable: "Partners",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_Partners_TenantId_PartnerId",
                table: "TenantMemberships");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_AccountType_IsActive",
                table: "TenantMemberships");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_PartnerId",
                table: "TenantMemberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_AccountType",
                table: "TenantMemberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_External",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "AccountType",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "BusinessRegistrationNumber",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "CompanyName",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "CompanyPhone",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "ContactEmail",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "ExternalPermissionsJson",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "PartnerId",
                table: "TenantMemberships");
        }
    }
}
