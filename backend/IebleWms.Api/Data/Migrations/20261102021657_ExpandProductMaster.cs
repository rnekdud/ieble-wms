using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ExpandProductMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId",
                table: "StorageBarcodes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products");

            migrationBuilder.AddColumn<string>(
                name: "BarcodeType",
                table: "StorageBarcodes",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Internal");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "StorageBarcodes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "StorageBarcodes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrimary",
                table: "StorageBarcodes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "StorageBarcodes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoxDepthCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoxHeightCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoxWeightGrams",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BoxWidthCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CostPrice",
                table: "Products",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Products",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "KRW");

            migrationBuilder.AddColumn<decimal>(
                name: "DepthCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasImage",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "HeightCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModelNumber",
                table: "Products",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Origin",
                table: "Products",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductTypeId",
                table: "Products",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RetailPrice",
                table: "Products",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WeightGrams",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WidthCm",
                table: "Products",
                type: "numeric(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "ProductCategories",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                table: "ProductCategories",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProductImages",
                columns: table => new
                {
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductImages", x => x.ProductId);
                    table.ForeignKey(
                        name: "FK_ProductImages_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProductTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductTypes", x => x.Id);
                    table.UniqueConstraint("AK_ProductTypes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.ForeignKey(
                        name: "FK_ProductTypes_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductTypes_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductTypes_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(name: "IX_StorageBarcodes_TenantId_ProductId", table: "StorageBarcodes", columns: new[] { "TenantId", "ProductId" });
            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId_IsPrimary",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "ProductId", "IsPrimary" },
                unique: true,
                filter: "\"ProductId\" IS NOT NULL AND \"IsPrimary\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_ProductTypeId",
                table: "Products",
                columns: new[] { "TenantId", "ProductTypeId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products",
                sql: "\"Unit\" IN ('EA','PCS','SET','PAIR','DOZEN','BOX','PACK','CTN','PALLET','ROLL','BAG','BUNDLE','mg','g','kg','ton','oz','lb','ml','L','m³','mm','cm','m','㎡')");

            migrationBuilder.CreateIndex(
                name: "IX_ProductCategories_TenantId_ParentId",
                table: "ProductCategories",
                columns: new[] { "TenantId", "ParentId" });

            migrationBuilder.CreateIndex(
                name: "IX_ProductImages_TenantId_ProductId",
                table: "ProductImages",
                columns: new[] { "TenantId", "ProductId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductTypes_CreatedByUserId",
                table: "ProductTypes",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductTypes_TenantId_NormalizedName",
                table: "ProductTypes",
                columns: new[] { "TenantId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductTypes_UpdatedByUserId",
                table: "ProductTypes",
                column: "UpdatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ProductCategories_ProductCategories_TenantId_ParentId",
                table: "ProductCategories",
                columns: new[] { "TenantId", "ParentId" },
                principalTable: "ProductCategories",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Products_ProductTypes_TenantId_ProductTypeId",
                table: "Products",
                columns: new[] { "TenantId", "ProductTypeId" },
                principalTable: "ProductTypes",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
            // Retain the existing barcode value/registry ID and designate it as primary.
            migrationBuilder.Sql("""
                UPDATE "StorageBarcodes" SET "IsPrimary" = TRUE,
                  "BarcodeType" = (SELECT p."BarcodeType" FROM "Products" p WHERE p."TenantId" = "StorageBarcodes"."TenantId" AND p."Id" = "StorageBarcodes"."ProductId")
                WHERE "ProductId" IS NOT NULL AND EXISTS (SELECT 1 FROM "Products" p WHERE p."TenantId" = "StorageBarcodes"."TenantId" AND p."Id" = "StorageBarcodes"."ProductId" AND p."Barcode" = "StorageBarcodes"."Value");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_StorageBarcodes_TenantId_ProductId", table: "StorageBarcodes");
            migrationBuilder.DropForeignKey(
                name: "FK_ProductCategories_ProductCategories_TenantId_ParentId",
                table: "ProductCategories");

            migrationBuilder.DropForeignKey(
                name: "FK_Products_ProductTypes_TenantId_ProductTypeId",
                table: "Products");

            migrationBuilder.DropTable(
                name: "ProductImages");

            migrationBuilder.DropTable(
                name: "ProductTypes");

            migrationBuilder.DropIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId_IsPrimary",
                table: "StorageBarcodes");

            migrationBuilder.DropIndex(
                name: "IX_Products_TenantId_ProductTypeId",
                table: "Products");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_ProductCategories_TenantId_ParentId",
                table: "ProductCategories");

            migrationBuilder.DropColumn(
                name: "BarcodeType",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "IsPrimary",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "BoxDepthCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "BoxHeightCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "BoxWeightGrams",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "BoxWidthCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CostPrice",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DepthCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "HasImage",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "HeightCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "ModelNumber",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Origin",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "ProductTypeId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "RetailPrice",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "WeightGrams",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "WidthCm",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "ProductCategories");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "ProductCategories");

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "ProductId" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Products_Unit",
                table: "Products",
                sql: "\"Unit\" IN ('EA','BOX','kg','g','L','ml','m')");
        }
    }
}
