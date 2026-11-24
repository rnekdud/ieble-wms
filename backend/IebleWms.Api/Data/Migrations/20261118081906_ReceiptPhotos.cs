using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReceiptPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReceiptPhotos",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false),
                    Thumbnail = table.Column<byte[]>(type: "bytea", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptPhotos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptPhotos_InboundReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "InboundReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptPhotos_TenantId_ReceiptId_Position",
                table: "ReceiptPhotos",
                columns: new[] { "TenantId", "ReceiptId", "Position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceiptPhotos");
        }
    }
}
