using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProducts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProductCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductCategories", x => x.Id);
                    table.UniqueConstraint("AK_ProductCategories_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ProductCategories_Name", "length(trim(\"Name\")) > 0");
                    table.ForeignKey(
                        name: "FK_ProductCategories_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductCategories_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductCategories_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProductChanges",
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
                    table.PrimaryKey("PK_ProductChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductChanges_AspNetUsers_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductChanges_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    NormalizedCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Barcode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BarcodeType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    BarcodeIsGenerated = table.Column<bool>(type: "boolean", nullable: false),
                    LotManaged = table.Column<bool>(type: "boolean", nullable: false),
                    ExpiryManaged = table.Column<bool>(type: "boolean", nullable: false),
                    SerialManaged = table.Column<bool>(type: "boolean", nullable: false),
                    SafetyStock = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    TrackingLockedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_Products", x => x.Id);
                    table.UniqueConstraint("AK_Products_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Products_Barcode", "(\"Barcode\" IS NULL OR length(\"Barcode\") BETWEEN 1 AND 64) AND \"BarcodeType\" IN ('Internal','External') AND (NOT \"BarcodeIsGenerated\" OR (\"Barcode\" IS NOT NULL AND \"BarcodeType\" = 'Internal'))");
                    table.CheckConstraint("CK_Products_Code", "length(trim(\"Code\")) > 0 AND length(trim(\"NormalizedCode\")) > 0");
                    table.CheckConstraint("CK_Products_Name", "length(trim(\"Name\")) > 0");
                    table.CheckConstraint("CK_Products_SafetyStock", "\"SafetyStock\" IS NULL OR \"SafetyStock\" BETWEEN 0 AND 999999999.999");
                    table.CheckConstraint("CK_Products_Unit", "\"Unit\" IN ('개','EA','박스','kg','g','L','ml','m')");
                    table.ForeignKey(
                        name: "FK_Products_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Products_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Products_ProductCategories_TenantId_CategoryId",
                        columns: x => new { x.TenantId, x.CategoryId },
                        principalTable: "ProductCategories",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Products_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductCategories_CreatedByUserId",
                table: "ProductCategories",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductCategories_TenantId_NormalizedName",
                table: "ProductCategories",
                columns: new[] { "TenantId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductCategories_UpdatedByUserId",
                table: "ProductCategories",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductChanges_ChangedByUserId",
                table: "ProductChanges",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductChanges_TenantId_TargetId_Id",
                table: "ProductChanges",
                columns: new[] { "TenantId", "TargetId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_Barcode",
                table: "Products",
                column: "Barcode",
                unique: true,
                filter: "\"BarcodeIsGenerated\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_Products_CreatedByUserId",
                table: "Products",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_Barcode",
                table: "Products",
                columns: new[] { "TenantId", "Barcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_CategoryId",
                table: "Products",
                columns: new[] { "TenantId", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_CreationRequestId",
                table: "Products",
                columns: new[] { "TenantId", "CreationRequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_IsActive_Code",
                table: "Products",
                columns: new[] { "TenantId", "IsActive", "Code" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_NormalizedCode",
                table: "Products",
                columns: new[] { "TenantId", "NormalizedCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_UpdatedByUserId",
                table: "Products",
                column: "UpdatedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductChanges");

            migrationBuilder.DropTable(
                name: "Products");

            migrationBuilder.DropTable(
                name: "ProductCategories");
        }
    }
}
