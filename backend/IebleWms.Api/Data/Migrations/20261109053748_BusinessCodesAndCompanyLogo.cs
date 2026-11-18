using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class BusinessCodesAndCompanyLogo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_Number",
                table: "BillingFeedbacks");

            migrationBuilder.AddColumn<Guid>(
                name: "LogoVersion",
                table: "Tenants",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BusinessCodeCounters",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Prefix = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    LastValue = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessCodeCounters", x => new { x.TenantId, x.Prefix });
                    table.ForeignKey(
                        name: "FK_BusinessCodeCounters_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CompanyLogos",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyLogos", x => x.TenantId);
                    table.ForeignKey(
                        name: "FK_CompanyLogos_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_TenantId_Number",
                table: "BillingFeedbacks",
                columns: new[] { "TenantId", "Number" },
                unique: true,
                filter: "\"Number\" <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessCodeCounters");

            migrationBuilder.DropTable(
                name: "CompanyLogos");

            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_TenantId_Number",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "LogoVersion",
                table: "Tenants");

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_Number",
                table: "BillingFeedbacks",
                column: "Number",
                unique: true,
                filter: "\"Number\" <> ''");
        }
    }
}
