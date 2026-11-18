using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReceivingInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InboundReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpectedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    PartnerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    WarehouseName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContactName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    InspectedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    InspectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ConfirmedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConfirmedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundReceipts", x => x.Id);
                    table.UniqueConstraint("AK_InboundReceipts_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Receipt_Status", "\"Status\" IN ('Planned','Inspecting','Confirmed','Cancelled')");
                    table.ForeignKey(
                        name: "FK_InboundReceipts_AspNetUsers_ConfirmedByUserId",
                        column: x => x.ConfirmedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceipts_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceipts_AspNetUsers_InspectedByUserId",
                        column: x => x.InspectedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceipts_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceipts_Partners_TenantId_PartnerId",
                        columns: x => new { x.TenantId, x.PartnerId },
                        principalTable: "Partners",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceipts_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InboundReceiptLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    ProductCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProductName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LotManaged = table.Column<bool>(type: "boolean", nullable: false),
                    ExpiryManaged = table.Column<bool>(type: "boolean", nullable: false),
                    SerialManaged = table.Column<bool>(type: "boolean", nullable: false),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    InspectedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    LotNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialsJson = table.Column<string>(type: "text", nullable: false),
                    PlacementsJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundReceiptLines", x => x.Id);
                    table.UniqueConstraint("AK_InboundReceiptLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ReceiptLine_Quantity", "\"ExpectedQuantity\" > 0 AND (\"InspectedQuantity\" IS NULL OR \"InspectedQuantity\" >= 0)");
                    table.ForeignKey(
                        name: "FK_InboundReceiptLines_InboundReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "InboundReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundReceiptLines_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReceiptChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceiptChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceiptChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReceiptChanges_InboundReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "InboundReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockBalances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptLineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceKey = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ReservedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockBalances", x => x.Id);
                    table.UniqueConstraint("AK_StockBalances_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Stock_Quantity", "\"Quantity\" >= 0 AND \"ReservedQuantity\" >= 0 AND \"ReservedQuantity\" <= \"Quantity\"");
                    table.ForeignKey(
                        name: "FK_StockBalances_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockBalances_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockBalances_InboundReceiptLines_TenantId_ReceiptLineId",
                        columns: x => new { x.TenantId, x.ReceiptLineId },
                        principalTable: "InboundReceiptLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockBalances_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockBalances_StorageLocations_TenantId_WarehouseId_Locatio~",
                        columns: x => new { x.TenantId, x.WarehouseId, x.LocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockMovements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockMovements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockMovements_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockMovements_InboundReceipts_TenantId_ReceiptId",
                        columns: x => new { x.TenantId, x.ReceiptId },
                        principalTable: "InboundReceipts",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockMovements_StockBalances_TenantId_StockId",
                        columns: x => new { x.TenantId, x.StockId },
                        principalTable: "StockBalances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceiptLines_TenantId_ProductId",
                table: "InboundReceiptLines",
                columns: new[] { "TenantId", "ProductId" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceiptLines_TenantId_ReceiptId",
                table: "InboundReceiptLines",
                columns: new[] { "TenantId", "ReceiptId" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_ConfirmedByUserId",
                table: "InboundReceipts",
                column: "ConfirmedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_CreatedByUserId",
                table: "InboundReceipts",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_InspectedByUserId",
                table: "InboundReceipts",
                column: "InspectedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_ExpectedDate_Status",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "ExpectedDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_Number",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_PartnerId",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "PartnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_RequestId",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_TenantId_WarehouseId",
                table: "InboundReceipts",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundReceipts_UpdatedByUserId",
                table: "InboundReceipts",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptChanges_ActorId",
                table: "ReceiptChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_ReceiptChanges_TenantId_ReceiptId_Id",
                table: "ReceiptChanges",
                columns: new[] { "TenantId", "ReceiptId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_CreatedByUserId",
                table: "StockBalances",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_ProductId_SerialNumber",
                table: "StockBalances",
                columns: new[] { "TenantId", "ProductId", "SerialNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_ReceiptLineId",
                table: "StockBalances",
                columns: new[] { "TenantId", "ReceiptLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_SourceKey",
                table: "StockBalances",
                columns: new[] { "TenantId", "SourceKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_WarehouseId_LocationId",
                table: "StockBalances",
                columns: new[] { "TenantId", "WarehouseId", "LocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_TenantId_WarehouseId_ProductId",
                table: "StockBalances",
                columns: new[] { "TenantId", "WarehouseId", "ProductId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_UpdatedByUserId",
                table: "StockBalances",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_ActorId",
                table: "StockMovements",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_ReceiptId",
                table: "StockMovements",
                columns: new[] { "TenantId", "ReceiptId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_StockId_ReceiptId",
                table: "StockMovements",
                columns: new[] { "TenantId", "StockId", "ReceiptId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceiptChanges");

            migrationBuilder.DropTable(
                name: "StockMovements");

            migrationBuilder.DropTable(
                name: "StockBalances");

            migrationBuilder.DropTable(
                name: "InboundReceiptLines");

            migrationBuilder.DropTable(
                name: "InboundReceipts");
        }
    }
}
