using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ExternalAccountLinkConsent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExternalAccountLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CollaboratorId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    OwnerApprovedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ApprovedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    OwnerSecurityStamp = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalAccountLinks", x => x.Id);
                    table.CheckConstraint("CK_ExternalAccountLink_Status", "\"Status\" IN ('PendingOwner','OwnerApproved','Approved','Rejected','Cancelled','Expired')");
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_AspNetUsers_ApprovedByUserId",
                        column: x => x.ApprovedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_AspNetUsers_RequestedByUserId",
                        column: x => x.RequestedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_ExternalCollaborators_TenantId_Collabo~",
                        columns: x => new { x.TenantId, x.CollaboratorId },
                        principalTable: "ExternalCollaborators",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalAccountLinks_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_ApprovedByUserId",
                table: "ExternalAccountLinks",
                column: "ApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_CreatedByUserId",
                table: "ExternalAccountLinks",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_RequestedByUserId",
                table: "ExternalAccountLinks",
                column: "RequestedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_TenantId_CollaboratorId",
                table: "ExternalAccountLinks",
                columns: new[] { "TenantId", "CollaboratorId" });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_TenantId_UserId",
                table: "ExternalAccountLinks",
                columns: new[] { "TenantId", "UserId" },
                unique: true,
                filter: "\"Status\" IN ('PendingOwner','OwnerApproved')");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_UpdatedByUserId",
                table: "ExternalAccountLinks",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalAccountLinks_UserId_Status",
                table: "ExternalAccountLinks",
                columns: new[] { "UserId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExternalAccountLinks");
        }
    }
}
