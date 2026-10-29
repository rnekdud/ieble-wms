using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WarehouseCodesAndSubscriptionCycles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CreationRequestId",
                table: "Warehouses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomCode",
                table: "Warehouses",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedCustomCode",
                table: "Warehouses",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TypeDescription",
                table: "Warehouses",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AutoBillingCanceledAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BillingAnchorDay",
                table: "Tenants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BillingPolicyVersion",
                table: "Tenants",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "BillingTimeZone",
                table: "Tenants",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "Asia/Seoul");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FirstChargeAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PaidThrough",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ServiceEndsAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TrialEndsAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TrialStartedAt",
                table: "Tenants",
                type: "timestamp with time zone",
                nullable: true);

            // Preserve the deployed version-1 schedule (Seoul calendar month / day 1).
            // Only new snapshot columns are populated. Existing status, amount and membership dates are untouched.
            migrationBuilder.Sql("""
                UPDATE "Tenants" SET
                    "TrialStartedAt" = "CreatedAt",
                    "TrialEndsAt" = (date_trunc('month', "CreatedAt" AT TIME ZONE 'Asia/Seoul') + interval '1 month') AT TIME ZONE 'Asia/Seoul',
                    "FirstChargeAt" = (date_trunc('month', "CreatedAt" AT TIME ZONE 'Asia/Seoul') + interval '1 month') AT TIME ZONE 'Asia/Seoul',
                    "BillingAnchorDay" = 1
                WHERE "BillingPolicyVersion" = 1;
                """);

            migrationBuilder.CreateTable(
                name: "BillingChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BillingChanges_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingFeedbacks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    Message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingFeedbacks", x => x.Id);
                    table.CheckConstraint("CK_BillingFeedback_Message", "length(trim(\"Message\")) > 0");
                    table.ForeignKey(
                        name: "FK_BillingFeedbacks_TenantMemberships_TenantId_UserId",
                        columns: x => new { x.TenantId, x.UserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CycleStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CycleEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UserCount = table.Column<int>(type: "integer", nullable: false),
                    AmountKrw = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ProviderPaymentId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingInvoices", x => x.Id);
                    table.CheckConstraint("CK_BillingInvoices_AmountPeriod", "\"AmountKrw\" >= 0 AND \"UserCount\" >= 0 AND \"CycleEnd\" > \"CycleStart\"");
                    table.ForeignKey(
                        name: "FK_BillingInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BillingReminderDismissals",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingReminderDismissals", x => new { x.TenantId, x.UserId });
                    table.ForeignKey(
                        name: "FK_BillingReminderDismissals_TenantMemberships_TenantId_UserId",
                        columns: x => new { x.TenantId, x.UserId },
                        principalTable: "TenantMemberships",
                        principalColumns: new[] { "TenantId", "UserId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_CreationRequestId",
                table: "Warehouses",
                columns: new[] { "TenantId", "CreationRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_TenantId_NormalizedCustomCode",
                table: "Warehouses",
                columns: new[] { "TenantId", "NormalizedCustomCode" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_BillingPolicy",
                table: "Tenants",
                sql: "\"BillingPolicyVersion\" IN (1, 2) AND (\"BillingAnchorDay\" IS NULL OR \"BillingAnchorDay\" BETWEEN 1 AND 31)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Tenants_Trial",
                table: "Tenants",
                sql: "\"BillingPolicyVersion\" = 1 OR (\"TrialStartedAt\" IS NOT NULL AND \"TrialEndsAt\" > \"TrialStartedAt\" AND \"FirstChargeAt\" >= \"TrialEndsAt\" AND \"BillingAnchorDay\" IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_BillingChanges_ActorId",
                table: "BillingChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingChanges_TenantId_Id",
                table: "BillingChanges",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_TenantId_UserId_RequestId",
                table: "BillingFeedbacks",
                columns: new[] { "TenantId", "UserId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_IdempotencyKey",
                table: "BillingInvoices",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_TenantId_CycleStart",
                table: "BillingInvoices",
                columns: new[] { "TenantId", "CycleStart" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillingChanges");

            migrationBuilder.DropTable(
                name: "BillingFeedbacks");

            migrationBuilder.DropTable(
                name: "BillingInvoices");

            migrationBuilder.DropTable(
                name: "BillingReminderDismissals");

            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_CreationRequestId",
                table: "Warehouses");

            migrationBuilder.DropIndex(
                name: "IX_Warehouses_TenantId_NormalizedCustomCode",
                table: "Warehouses");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_BillingPolicy",
                table: "Tenants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Tenants_Trial",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "CreationRequestId",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "CustomCode",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "NormalizedCustomCode",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "TypeDescription",
                table: "Warehouses");

            migrationBuilder.DropColumn(
                name: "AutoBillingCanceledAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BillingAnchorDay",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BillingPolicyVersion",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "BillingTimeZone",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "FirstChargeAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PaidThrough",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ServiceEndsAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "TrialEndsAt",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "TrialStartedAt",
                table: "Tenants");
        }
    }
}
