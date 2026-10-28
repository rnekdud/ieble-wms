using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeBusinessNumbersAndDefaultMembership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "Tenants" WHERE "BusinessRegistrationNumber" IS NOT NULL
                        AND regexp_replace("BusinessRegistrationNumber", '[-[:space:]]', '', 'g') !~ '^[0-9]{10}$') THEN
                        RAISE EXCEPTION 'Existing business numbers require manual review; no rows were deleted or merged';
                    END IF;
                    IF EXISTS (SELECT 1 FROM "Tenants" WHERE "BusinessRegistrationNumber" IS NOT NULL
                        GROUP BY regexp_replace("BusinessRegistrationNumber", '[-[:space:]]', '', 'g') HAVING count(*) > 1) THEN
                        RAISE EXCEPTION 'Duplicate normalized business numbers require manual review; no rows were deleted or merged';
                    END IF;
                END $$;
                UPDATE "Tenants" SET "BusinessRegistrationNumber" = regexp_replace("BusinessRegistrationNumber", '[-[:space:]]', '', 'g')
                WHERE "BusinessRegistrationNumber" IS NOT NULL;
                """);

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants");

            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                table: "TenantMemberships",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants",
                sql: "\"BusinessRegistrationNumber\" IS NULL OR (length(\"BusinessRegistrationNumber\") = 10 AND replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(\"BusinessRegistrationNumber\", '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = '')");

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_DefaultUser",
                table: "TenantMemberships",
                column: "UserId",
                unique: true,
                filter: "\"IsDefault\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_DefaultUser",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "IsDefault",
                table: "TenantMemberships");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants",
                sql: "\"BusinessRegistrationNumber\" IS NULL OR (length(\"BusinessRegistrationNumber\") = 10)");
        }
    }
}
