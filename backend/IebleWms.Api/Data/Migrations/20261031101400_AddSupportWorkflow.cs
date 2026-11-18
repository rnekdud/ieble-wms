using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "BillingFeedbacks",
                type: "character varying(10000)",
                maxLength: 10000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000);

            migrationBuilder.AddColumn<string>(
                name: "Answer",
                table: "BillingFeedbacks",
                type: "character varying(10000)",
                maxLength: 10000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AnsweredAt",
                table: "BillingFeedbacks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AnsweredById",
                table: "BillingFeedbacks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssignedToId",
                table: "BillingFeedbacks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "BillingFeedbacks",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Billing");

            migrationBuilder.AddColumn<string>(
                name: "Number",
                table: "BillingFeedbacks",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RequestHash",
                table: "BillingFeedbacks",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "BillingFeedbacks",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Received");

            migrationBuilder.AddColumn<string>(
                name: "Title",
                table: "BillingFeedbacks",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "Billing feedback");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "BillingFeedbacks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "BillingFeedbacks",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddUniqueConstraint(
                name: "AK_BillingFeedbacks_TenantId_Id",
                table: "BillingFeedbacks",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.CreateTable(
                name: "SupportAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeedbackId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportAttachments_BillingFeedbacks_TenantId_FeedbackId",
                        columns: x => new { x.TenantId, x.FeedbackId },
                        principalTable: "BillingFeedbacks",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupportChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeedbackId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupportChanges_BillingFeedbacks_TenantId_FeedbackId",
                        columns: x => new { x.TenantId, x.FeedbackId },
                        principalTable: "BillingFeedbacks",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_AnsweredById",
                table: "BillingFeedbacks",
                column: "AnsweredById");

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_AssignedToId",
                table: "BillingFeedbacks",
                column: "AssignedToId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_Number",
                table: "BillingFeedbacks",
                column: "Number",
                unique: true,
                filter: "\"Number\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_BillingFeedbacks_TenantId_CreatedAt",
                table: "BillingFeedbacks",
                columns: new[] { "TenantId", "CreatedAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Support_Status",
                table: "BillingFeedbacks",
                sql: "\"Status\" IN ('Received','InProgress','Answered','Closed')");

            migrationBuilder.CreateIndex(
                name: "IX_SupportAttachments_TenantId_FeedbackId",
                table: "SupportAttachments",
                columns: new[] { "TenantId", "FeedbackId" });

            migrationBuilder.CreateIndex(
                name: "IX_SupportChanges_ActorId",
                table: "SupportChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_SupportChanges_TenantId_FeedbackId_Id",
                table: "SupportChanges",
                columns: new[] { "TenantId", "FeedbackId", "Id" });

            migrationBuilder.AddForeignKey(
                name: "FK_BillingFeedbacks_AspNetUsers_AnsweredById",
                table: "BillingFeedbacks",
                column: "AnsweredById",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_BillingFeedbacks_AspNetUsers_AssignedToId",
                table: "BillingFeedbacks",
                column: "AssignedToId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BillingFeedbacks_AspNetUsers_AnsweredById",
                table: "BillingFeedbacks");

            migrationBuilder.DropForeignKey(
                name: "FK_BillingFeedbacks_AspNetUsers_AssignedToId",
                table: "BillingFeedbacks");

            migrationBuilder.DropTable(
                name: "SupportAttachments");

            migrationBuilder.DropTable(
                name: "SupportChanges");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_BillingFeedbacks_TenantId_Id",
                table: "BillingFeedbacks");

            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_AnsweredById",
                table: "BillingFeedbacks");

            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_AssignedToId",
                table: "BillingFeedbacks");

            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_Number",
                table: "BillingFeedbacks");

            migrationBuilder.DropIndex(
                name: "IX_BillingFeedbacks_TenantId_CreatedAt",
                table: "BillingFeedbacks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Support_Status",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Answer",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "AnsweredAt",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "AnsweredById",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "AssignedToId",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Number",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "RequestHash",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Title",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "BillingFeedbacks");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "BillingFeedbacks");

            migrationBuilder.AlterColumn<string>(
                name: "Message",
                table: "BillingFeedbacks",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(10000)",
                oldMaxLength: 10000);
        }
    }
}
