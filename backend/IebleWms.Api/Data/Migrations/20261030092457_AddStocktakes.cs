using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStocktakes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements");

            migrationBuilder.AddColumn<Guid>(
                name: "StocktakeId",
                table: "StockMovements",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Stocktakes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Scope = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ScopeId = table.Column<Guid>(type: "uuid", nullable: true),
                    ScopeLabel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BasisAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    BasisDate = table.Column<DateOnly>(type: "date", nullable: false),
                    SnapshotAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ContactName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ConfirmedBy = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_Stocktakes", x => x.Id);
                    table.UniqueConstraint("AK_Stocktakes_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Stocktake_Scope", "(\"Scope\" = 'Warehouse' AND \"ScopeId\" IS NULL) OR (\"Scope\" IN ('Zone','Rack','Location') AND \"ScopeId\" IS NOT NULL)");
                    table.CheckConstraint("CK_Stocktake_Status", "\"Status\" IN ('Prepared','Counting','Counted','Reviewing','Confirmed','Cancelled')");
                    table.ForeignKey(
                        name: "FK_Stocktakes_AspNetUsers_ConfirmedBy",
                        column: x => x.ConfirmedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Stocktakes_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StocktakeTargets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StocktakeId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductCode = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProductName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    LocationCode = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RackCode = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    OriginalQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    OriginalReserved = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    OriginalSnapshotAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    BaselineQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    BaselineReserved = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    BaselineVersion = table.Column<Guid>(type: "uuid", nullable: false),
                    BaselineAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CountedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    ObservedSerial = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CountedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    CountedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsUnregistered = table.Column<bool>(type: "boolean", nullable: false),
                    Excluded = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StocktakeTargets", x => x.Id);
                    table.UniqueConstraint("AK_StocktakeTargets_TenantId_StocktakeId_Id", x => new { x.TenantId, x.StocktakeId, x.Id });
                    table.CheckConstraint("CK_StocktakeTarget_Quantity", "\"OriginalQuantity\" >= 0 AND \"BaselineQuantity\" >= 0 AND (\"CountedQuantity\" IS NULL OR \"CountedQuantity\" >= 0)");
                    table.ForeignKey(
                        name: "FK_StocktakeTargets_AspNetUsers_CountedBy",
                        column: x => x.CountedBy,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeTargets_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeTargets_StockBalances_TenantId_StockId",
                        columns: x => new { x.TenantId, x.StockId },
                        principalTable: "StockBalances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeTargets_Stocktakes_TenantId_StocktakeId",
                        columns: x => new { x.TenantId, x.StocktakeId },
                        principalTable: "Stocktakes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeTargets_StorageLocations_TenantId_WarehouseId_Loca~",
                        columns: x => new { x.TenantId, x.WarehouseId, x.LocationId },
                        principalTable: "StorageLocations",
                        principalColumns: new[] { "TenantId", "WarehouseId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StocktakeChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    StocktakeId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StocktakeChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StocktakeChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeChanges_StocktakeTargets_TenantId_StocktakeId_Targ~",
                        columns: x => new { x.TenantId, x.StocktakeId, x.TargetId },
                        principalTable: "StocktakeTargets",
                        principalColumns: new[] { "TenantId", "StocktakeId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StocktakeChanges_Stocktakes_TenantId_StocktakeId",
                        columns: x => new { x.TenantId, x.StocktakeId },
                        principalTable: "Stocktakes",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_StockId_StocktakeId",
                table: "StockMovements",
                columns: new[] { "TenantId", "StockId", "StocktakeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_StocktakeId",
                table: "StockMovements",
                columns: new[] { "TenantId", "StocktakeId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements",
                sql: "(\"StocktakeId\" IS NULL AND ((\"OperationId\" IS NULL AND ((\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0))) OR (\"OperationId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" IN ('MoveIn','AdjustmentIncrease') AND \"Quantity\" > 0) OR (\"Type\" IN ('MoveOut','AdjustmentDecrease') AND \"Quantity\" < 0))))) OR (\"StocktakeId\" IS NOT NULL AND \"OperationId\" IS NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" = 'StocktakeIncrease' AND \"Quantity\" > 0) OR (\"Type\" = 'StocktakeDecrease' AND \"Quantity\" < 0)))");

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeChanges_ActorId",
                table: "StocktakeChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeChanges_TenantId_StocktakeId_Id",
                table: "StocktakeChanges",
                columns: new[] { "TenantId", "StocktakeId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeChanges_TenantId_StocktakeId_TargetId",
                table: "StocktakeChanges",
                columns: new[] { "TenantId", "StocktakeId", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_ConfirmedBy",
                table: "Stocktakes",
                column: "ConfirmedBy");

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_TenantId_BasisDate_Status",
                table: "Stocktakes",
                columns: new[] { "TenantId", "BasisDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_TenantId_Number",
                table: "Stocktakes",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_TenantId_RequestId",
                table: "Stocktakes",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Stocktakes_TenantId_WarehouseId",
                table: "Stocktakes",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeTargets_CountedBy",
                table: "StocktakeTargets",
                column: "CountedBy");

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeTargets_TenantId_ProductId",
                table: "StocktakeTargets",
                columns: new[] { "TenantId", "ProductId" });

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeTargets_TenantId_StockId",
                table: "StocktakeTargets",
                columns: new[] { "TenantId", "StockId" });

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeTargets_TenantId_StocktakeId_StockId",
                table: "StocktakeTargets",
                columns: new[] { "TenantId", "StocktakeId", "StockId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StocktakeTargets_TenantId_WarehouseId_LocationId",
                table: "StocktakeTargets",
                columns: new[] { "TenantId", "WarehouseId", "LocationId" });

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_Stocktakes_TenantId_StocktakeId",
                table: "StockMovements",
                columns: new[] { "TenantId", "StocktakeId" },
                principalTable: "Stocktakes",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_Stocktakes_TenantId_StocktakeId",
                table: "StockMovements");

            migrationBuilder.DropTable(
                name: "StocktakeChanges");

            migrationBuilder.DropTable(
                name: "StocktakeTargets");

            migrationBuilder.DropTable(
                name: "Stocktakes");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_StockId_StocktakeId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_StocktakeId",
                table: "StockMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "StocktakeId",
                table: "StockMovements");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements",
                sql: "(\"OperationId\" IS NULL AND ((\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0))) OR (\"OperationId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"ShipmentId\" IS NULL AND ((\"Type\" IN ('MoveIn','AdjustmentIncrease') AND \"Quantity\" > 0) OR (\"Type\" IN ('MoveOut','AdjustmentDecrease') AND \"Quantity\" < 0)))");
        }
    }
}
