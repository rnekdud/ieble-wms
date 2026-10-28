using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyRegistration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BusinessRegistrationNumber",
                table: "Tenants",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceStatus",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Active");

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_BusinessRegistrationNumber",
                table: "Tenants",
                column: "BusinessRegistrationNumber",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants",
                sql: "\"BusinessRegistrationNumber\" IS NULL OR (length(\"BusinessRegistrationNumber\") = 10)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants",
                sql: "\"ServiceStatus\" IN ('PendingActivation', 'Active', 'Suspended')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tenants_BusinessRegistrationNumber",
                table: "Tenants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_BusinessRegistrationNumber",
                table: "Tenants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BusinessRegistrationNumber",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ServiceStatus",
                table: "Tenants");
        }
    }
}
