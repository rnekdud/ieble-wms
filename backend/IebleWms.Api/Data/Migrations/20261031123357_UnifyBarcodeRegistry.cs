using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class UnifyBarcodeRegistry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fail atomically if historical product/storage values collide. Never rewrite a label.
            migrationBuilder.Sql("""
                LOCK TABLE "Products", "StorageBarcodes" IN SHARE ROW EXCLUSIVE MODE;
                DO $$ BEGIN
                  IF EXISTS (SELECT 1 FROM "Products" p JOIN "StorageBarcodes" b ON p."Barcode"=b."Value" WHERE p."TenantId"=b."TenantId" OR (p."BarcodeIsGenerated" AND b."IsGenerated")) THEN
                    RAISE EXCEPTION 'Existing product/storage barcode conflicts require review; labels were not changed';
                  END IF;
                END $$;
                """);
            migrationBuilder.DropCheckConstraint(
                name: "CK_StorageBarcodes_Owner",
                table: "StorageBarcodes");

            migrationBuilder.CreateSequence(
                name: "InternalBarcodeNumbers",
                maxValue: 99999999999999999L);

            migrationBuilder.AlterColumn<Guid>(
                name: "WarehouseId",
                table: "StorageBarcodes",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "ProductId",
                table: "StorageBarcodes",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "ProductId" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StorageBarcodes_Owner",
                table: "StorageBarcodes",
                sql: "(\"ProductId\" IS NOT NULL AND \"WarehouseId\" IS NULL AND \"RackId\" IS NULL AND \"LocationId\" IS NULL) OR (\"ProductId\" IS NULL AND \"WarehouseId\" IS NOT NULL AND ((\"RackId\" IS NOT NULL AND \"LocationId\" IS NULL) OR (\"RackId\" IS NULL AND \"LocationId\" IS NOT NULL)))");

            migrationBuilder.AddForeignKey(
                name: "FK_StorageBarcodes_Products_TenantId_ProductId",
                table: "StorageBarcodes",
                columns: new[] { "TenantId", "ProductId" },
                principalTable: "Products",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                INSERT INTO "StorageBarcodes" ("Id","TenantId","ProductId","Value","IsGenerated")
                SELECT gen_random_uuid(),"TenantId","Id","Barcode","BarcodeIsGenerated" FROM "Products" WHERE "Barcode" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DO $$ BEGIN IF EXISTS (SELECT 1 FROM \"StorageBarcodes\" WHERE \"ProductId\" IS NOT NULL) THEN RAISE EXCEPTION 'Product barcode registrations exist; automatic downgrade is not safe'; END IF; END $$;");
            migrationBuilder.DropForeignKey(
                name: "FK_StorageBarcodes_Products_TenantId_ProductId",
                table: "StorageBarcodes");

            migrationBuilder.DropIndex(
                name: "IX_StorageBarcodes_TenantId_ProductId",
                table: "StorageBarcodes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StorageBarcodes_Owner",
                table: "StorageBarcodes");

            migrationBuilder.DropColumn(
                name: "ProductId",
                table: "StorageBarcodes");

            migrationBuilder.DropSequence(
                name: "InternalBarcodeNumbers");

            migrationBuilder.AlterColumn<Guid>(
                name: "WarehouseId",
                table: "StorageBarcodes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StorageBarcodes_Owner",
                table: "StorageBarcodes",
                sql: "(\"RackId\" IS NOT NULL AND \"LocationId\" IS NULL) OR (\"RackId\" IS NULL AND \"LocationId\" IS NOT NULL)");
        }
    }
}
