using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductImageGallery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_ProductImages",
                table: "ProductImages");

            migrationBuilder.DropIndex(
                name: "IX_ProductImages_TenantId_ProductId",
                table: "ProductImages");

            migrationBuilder.AddColumn<Guid>(
                name: "Id",
                table: "ProductImages",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "ProductImages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrimary",
                table: "ProductImages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Position",
                table: "ProductImages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Existing one-image rows keep their original product reference and bytes.
            // No historical upload time is invented; CreatedAt remains null for legacy images.
            migrationBuilder.Sql("UPDATE \"ProductImages\" SET \"Id\" = \"ProductId\", \"IsPrimary\" = TRUE;");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ProductImages",
                table: "ProductImages",
                column: "Id");

            migrationBuilder.CreateIndex(
                name: "IX_ProductImages_TenantId_ProductId_IsPrimary",
                table: "ProductImages",
                columns: new[] { "TenantId", "ProductId", "IsPrimary" },
                unique: true,
                filter: "\"IsPrimary\" = TRUE");

            migrationBuilder.CreateIndex(
                name: "IX_ProductImages_TenantId_ProductId_Position",
                table: "ProductImages",
                columns: new[] { "TenantId", "ProductId", "Position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_ProductImages",
                table: "ProductImages");

            migrationBuilder.DropIndex(
                name: "IX_ProductImages_TenantId_ProductId_IsPrimary",
                table: "ProductImages");

            migrationBuilder.DropIndex(
                name: "IX_ProductImages_TenantId_ProductId_Position",
                table: "ProductImages");

            migrationBuilder.DropColumn(
                name: "Id",
                table: "ProductImages");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "ProductImages");

            migrationBuilder.DropColumn(
                name: "IsPrimary",
                table: "ProductImages");

            migrationBuilder.DropColumn(
                name: "Position",
                table: "ProductImages");

            migrationBuilder.AddPrimaryKey(
                name: "PK_ProductImages",
                table: "ProductImages",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductImages_TenantId_ProductId",
                table: "ProductImages",
                columns: new[] { "TenantId", "ProductId" },
                unique: true);
        }
    }
}
