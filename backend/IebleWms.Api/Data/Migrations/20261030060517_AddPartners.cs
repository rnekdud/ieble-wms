using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPartners : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Partners",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    NormalizedCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    RegistrationCountry = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    NormalizedBusinessNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BusinessRegistrationNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    RepresentativeName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PostalCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Address = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    AddressDetail = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Phone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    ContactName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ContactPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PaymentTerms = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreationRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreationHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Partners", x => x.Id);
                    table.UniqueConstraint("AK_Partners_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Partners_BusinessNumber", "\"NormalizedBusinessNumber\" IS NULL OR \"RegistrationCountry\" <> 'KR' OR (length(\"NormalizedBusinessNumber\") = 10 AND replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(\"NormalizedBusinessNumber\", '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = '')");
                    table.CheckConstraint("CK_Partners_Code", "length(trim(\"Code\")) > 0 AND length(trim(\"NormalizedCode\")) > 0");
                    table.CheckConstraint("CK_Partners_Country", "\"RegistrationCountry\" IN ('KR','OTHER')");
                    table.CheckConstraint("CK_Partners_Name", "length(trim(\"Name\")) > 0");
                    table.CheckConstraint("CK_Partners_Type", "\"Type\" IN ('SUPPLIER','CUSTOMER','BOTH')");
                    table.ForeignKey(
                        name: "FK_Partners_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Partners_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Partners_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PartnerChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PartnerChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PartnerChanges_AspNetUsers_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PartnerChanges_Partners_TenantId_TargetId",
                        columns: x => new { x.TenantId, x.TargetId },
                        principalTable: "Partners",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PartnerChanges_ChangedByUserId",
                table: "PartnerChanges",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PartnerChanges_TenantId_TargetId_Id",
                table: "PartnerChanges",
                columns: new[] { "TenantId", "TargetId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Partners_CreatedByUserId",
                table: "Partners",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Partners_TenantId_CreationRequestId",
                table: "Partners",
                columns: new[] { "TenantId", "CreationRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Partners_TenantId_IsActive_Type",
                table: "Partners",
                columns: new[] { "TenantId", "IsActive", "Type" });

            migrationBuilder.CreateIndex(
                name: "IX_Partners_TenantId_NormalizedCode",
                table: "Partners",
                columns: new[] { "TenantId", "NormalizedCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Partners_TenantId_RegistrationCountry_NormalizedBusinessNum~",
                table: "Partners",
                columns: new[] { "TenantId", "RegistrationCountry", "NormalizedBusinessNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Partners_UpdatedByUserId",
                table: "Partners",
                column: "UpdatedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PartnerChanges");

            migrationBuilder.DropTable(
                name: "Partners");
        }
    }
}
