using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements");

            migrationBuilder.AddColumn<Guid>(
                name: "OperationId",
                table: "StockMovements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ReceiptLineId",
                table: "StockBalances",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateTable(
                name: "InventoryOperations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProductName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SourceStockId = table.Column<Guid>(type: "uuid", nullable: true),
                    DestinationStockId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceWarehouseId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    DestinationWarehouseId = table.Column<Guid>(type: "uuid", nullable: true),
                    DestinationLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceLabel = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: true),
                    DestinationLabel = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    BeforeSource = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    AfterSource = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    BeforeDestination = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    AfterDestination = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryOperations", x => x.Id);
                    table.UniqueConstraint("AK_InventoryOperations_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_InventoryOperation_Quantity", "\"Quantity\" > 0 AND \"BeforeSource\" >= 0 AND \"AfterSource\" >= 0 AND \"BeforeDestination\" >= 0 AND \"AfterDestination\" >= 0");
                    table.CheckConstraint("CK_InventoryOperation_Type", "\"Type\" IN ('Move','Increase','Decrease')");
                    table.ForeignKey(
                        name: "FK_InventoryOperations_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryOperations_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryOperations_StockBalances_TenantId_DestinationStock~",
                        columns: x => new { x.TenantId, x.DestinationStockId },
                        principalTable: "StockBalances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryOperations_StockBalances_TenantId_SourceStockId",
                        columns: x => new { x.TenantId, x.SourceStockId },
                        principalTable: "StockBalances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryOperations_StorageLocations_TenantId_DestinationWa~",
                        columns: x => new { x.TenantId, x.DestinationWarehouseId, x.DestinationLocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryOperations_StorageLocations_TenantId_SourceWarehou~",
                        columns: x => new { x.TenantId, x.SourceWarehouseId, x.SourceLocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryChanges_InventoryOperations_TenantId_OperationId",
                        columns: x => new { x.TenantId, x.OperationId },
                        principalTable: "InventoryOperations",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_OperationId",
                table: "StockMovements",
                columns: new[] { "TenantId", "OperationId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_StockId_OperationId_Type",
                table: "StockMovements",
                columns: new[] { "TenantId", "StockId", "OperationId", "Type" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements",
                sql: "(\"OperationId\" IS NULL AND ((\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0))) OR (\"OperationId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" IN ('MoveIn','AdjustmentIncrease') AND \"Quantity\" > 0) OR (\"Type\" IN ('MoveOut','AdjustmentDecrease') AND \"Quantity\" < 0)))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Stock_SerialQuantity",
                table: "StockBalances",
                sql: "\"SerialNumber\" IS NULL OR (CAST(\"Quantity\" AS NUMERIC) IN (0,1) AND CAST(\"ReservedQuantity\" AS NUMERIC) IN (0,1))");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryChanges_ActorId",
                table: "InventoryChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryChanges_TenantId_OperationId",
                table: "InventoryChanges",
                columns: new[] { "TenantId", "OperationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_ActorId",
                table: "InventoryOperations",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_DestinationStockId",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "DestinationStockId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_DestinationWarehouseId_Destina~",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "DestinationWarehouseId", "DestinationLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_Number",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_ProductId_Type",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "ProductId", "Type" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_RequestId",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_SourceStockId",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "SourceStockId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryOperations_TenantId_SourceWarehouseId_SourceLocati~",
                table: "InventoryOperations",
                columns: new[] { "TenantId", "SourceWarehouseId", "SourceLocationId" });

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_InventoryOperations_TenantId_OperationId",
                table: "StockMovements",
                columns: new[] { "TenantId", "OperationId" },
                principalTable: "InventoryOperations",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_InventoryOperations_TenantId_OperationId",
                table: "StockMovements");

            migrationBuilder.DropTable(
                name: "InventoryChanges");

            migrationBuilder.DropTable(
                name: "InventoryOperations");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_OperationId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_StockId_OperationId_Type",
                table: "StockMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Stock_SerialQuantity",
                table: "StockBalances");

            migrationBuilder.DropColumn(
                name: "OperationId",
                table: "StockMovements");

            migrationBuilder.AlterColumn<Guid>(
                name: "ReceiptLineId",
                table: "StockBalances",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements",
                sql: "(\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0)");
        }
    }
}
