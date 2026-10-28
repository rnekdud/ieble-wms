using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceApprovalWithBillingGate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants");

            migrationBuilder.AddColumn<string>(
                name: "BillingStatus",
                table: "Tenants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CardRequired");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_BillingStatus",
                table: "Tenants",
                sql: "\"BillingStatus\" IN ('CardRequired', 'PaymentRequired', 'Paid')");

            // Preserve all rows and immutable status history; retire the old approval gate.
            migrationBuilder.Sql("UPDATE \"Tenants\" SET \"ServiceStatus\" = 'Active' WHERE \"ServiceStatus\" IN ('PendingActivation', 'Rejected')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants",
                sql: "\"ServiceStatus\" IN ('Active', 'Suspended')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_BillingStatus",
                table: "Tenants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BillingStatus",
                table: "Tenants");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_ServiceStatus",
                table: "Tenants",
                sql: "\"ServiceStatus\" IN ('PendingActivation', 'Active', 'Suspended', 'Rejected')");
        }
    }
}
