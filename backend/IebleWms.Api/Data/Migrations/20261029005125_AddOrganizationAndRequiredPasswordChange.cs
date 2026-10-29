using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationAndRequiredPasswordChange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "Tenants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "Tenants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                table: "Tenants",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RepresentativeName",
                table: "Tenants",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BillingEndsAt",
                table: "TenantMemberships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BillingStartsAt",
                table: "TenantMemberships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeactivatedAt",
                table: "TenantMemberships",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DisplayName",
                table: "TenantMemberships",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "MustChangePassword",
                table: "AspNetUsers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill only the new columns. Preserve all original identity, tenancy and audit values.
            migrationBuilder.Sql("""
                UPDATE "Tenants" AS t
                SET "ContactName" = source."DisplayName", "ContactPhone" = source."PhoneNumber"
                FROM (
                    SELECT DISTINCT ON (m."TenantId") m."TenantId", u."DisplayName",
                        CASE WHEN length(u."PhoneNumber") <= 30 THEN u."PhoneNumber" ELSE NULL END AS "PhoneNumber"
                    FROM "TenantMemberships" m JOIN "AspNetUsers" u ON u."Id" = m."UserId"
                    WHERE m."Role" = 'Master'
                    ORDER BY m."TenantId", m."CreatedAt", m."UserId"
                ) source
                WHERE t."Id" = source."TenantId";
                UPDATE "TenantMemberships" m
                SET "DisplayName" = u."DisplayName",
                    "BillingStartsAt" = (date_trunc('month', m."CreatedAt" AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 month') AT TIME ZONE 'Asia/Seoul'
                FROM "AspNetUsers" u WHERE u."Id" = m."UserId";
                """);

            migrationBuilder.CreateTable(
                name: "OrganizationChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganizationChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrganizationChanges_AspNetUsers_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrganizationChanges_AspNetUsers_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrganizationChanges_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationChanges_ChangedByUserId",
                table: "OrganizationChanges",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationChanges_TargetUserId",
                table: "OrganizationChanges",
                column: "TargetUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OrganizationChanges_TenantId_Id",
                table: "OrganizationChanges",
                columns: new[] { "TenantId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrganizationChanges");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "RepresentativeName",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BillingEndsAt",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "BillingStartsAt",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "DeactivatedAt",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "DisplayName",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "MustChangePassword",
                table: "AspNetUsers");
        }
    }
}
