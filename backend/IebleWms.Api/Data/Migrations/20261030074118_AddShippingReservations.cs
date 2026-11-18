using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddShippingReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "ReceiptId",
                table: "StockMovements",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "ShipmentId",
                table: "StockMovements",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OutboundShipments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RequestDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpectedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    PartnerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    WarehouseName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContactName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PickedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PickedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_OutboundShipments", x => x.Id);
                    table.UniqueConstraint("AK_OutboundShipments_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Shipment_Status", "\"Status\" IN ('Requested','Picking','Picked','Inspected','Confirmed','Cancelled')");
                    table.ForeignKey(
                        name: "FK_OutboundShipments_AspNetUsers_ConfirmedByUserId",
                        column: x => x.ConfirmedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_AspNetUsers_InspectedByUserId",
                        column: x => x.InspectedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_AspNetUsers_PickedByUserId",
                        column: x => x.PickedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_Partners_TenantId_PartnerId",
                        columns: x => new { x.TenantId, x.PartnerId },
                        principalTable: "Partners",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipments_Warehouses_TenantId_WarehouseId",
                        columns: x => new { x.TenantId, x.WarehouseId },
                        principalTable: "Warehouses",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundShipmentLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShipmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    ProductCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ProductName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    LotManaged = table.Column<bool>(type: "boolean", nullable: false),
                    ExpiryManaged = table.Column<bool>(type: "boolean", nullable: false),
                    SerialManaged = table.Column<bool>(type: "boolean", nullable: false),
                    RequestedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    LotNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialsJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundShipmentLines", x => x.Id);
                    table.UniqueConstraint("AK_OutboundShipmentLines_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_ShipmentLine_Quantity", "\"RequestedQuantity\" > 0");
                    table.ForeignKey(
                        name: "FK_OutboundShipmentLines_OutboundShipments_TenantId_ShipmentId",
                        columns: x => new { x.TenantId, x.ShipmentId },
                        principalTable: "OutboundShipments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundShipmentLines_Products_TenantId_ProductId",
                        columns: x => new { x.TenantId, x.ProductId },
                        principalTable: "Products",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShipmentChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ShipmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShipmentChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShipmentChanges_AspNetUsers_ActorId",
                        column: x => x.ActorId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShipmentChanges_OutboundShipments_TenantId_ShipmentId",
                        columns: x => new { x.TenantId, x.ShipmentId },
                        principalTable: "OutboundShipments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShipmentAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RackCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LotNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SerialNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    PickedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    InspectedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PickedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PickedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    InspectedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    InspectedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShipmentAllocations", x => x.Id);
                    table.CheckConstraint("CK_Allocation_Quantity", "\"Quantity\" > 0 AND \"PickedQuantity\" >= 0 AND \"PickedQuantity\" <= \"Quantity\" AND \"InspectedQuantity\" >= 0 AND \"InspectedQuantity\" <= \"PickedQuantity\"");
                    table.CheckConstraint("CK_Allocation_State", "\"State\" IN ('Active','Released','Consumed')");
                    table.ForeignKey(
                        name: "FK_ShipmentAllocations_AspNetUsers_InspectedByUserId",
                        column: x => x.InspectedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShipmentAllocations_AspNetUsers_PickedByUserId",
                        column: x => x.PickedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShipmentAllocations_OutboundShipmentLines_TenantId_LineId",
                        columns: x => new { x.TenantId, x.LineId },
                        principalTable: "OutboundShipmentLines",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ShipmentAllocations_StockBalances_TenantId_StockId",
                        columns: x => new { x.TenantId, x.StockId },
                        principalTable: "StockBalances",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_ShipmentId",
                table: "StockMovements",
                columns: new[] { "TenantId", "ShipmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_TenantId_StockId_ShipmentId",
                table: "StockMovements",
                columns: new[] { "TenantId", "StockId", "ShipmentId" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements",
                sql: "(\"Type\" = 'ReceiptConfirmed' AND \"ReceiptId\" IS NOT NULL AND \"ShipmentId\" IS NULL AND \"Quantity\" > 0) OR (\"Type\" = 'ShipmentConfirmed' AND \"ShipmentId\" IS NOT NULL AND \"ReceiptId\" IS NULL AND \"Quantity\" < 0)");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipmentLines_TenantId_ProductId",
                table: "OutboundShipmentLines",
                columns: new[] { "TenantId", "ProductId" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipmentLines_TenantId_ShipmentId",
                table: "OutboundShipmentLines",
                columns: new[] { "TenantId", "ShipmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_ConfirmedByUserId",
                table: "OutboundShipments",
                column: "ConfirmedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_CreatedByUserId",
                table: "OutboundShipments",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_InspectedByUserId",
                table: "OutboundShipments",
                column: "InspectedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_PickedByUserId",
                table: "OutboundShipments",
                column: "PickedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_ExpectedDate_Status",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "ExpectedDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_Number",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_PartnerId",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "PartnerId" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_RequestId",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_TenantId_WarehouseId",
                table: "OutboundShipments",
                columns: new[] { "TenantId", "WarehouseId" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundShipments_UpdatedByUserId",
                table: "OutboundShipments",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_InspectedByUserId",
                table: "ShipmentAllocations",
                column: "InspectedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_PickedByUserId",
                table: "ShipmentAllocations",
                column: "PickedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_TenantId_LineId_StockId",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "LineId", "StockId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentAllocations_TenantId_StockId",
                table: "ShipmentAllocations",
                columns: new[] { "TenantId", "StockId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentChanges_ActorId",
                table: "ShipmentChanges",
                column: "ActorId");

            migrationBuilder.CreateIndex(
                name: "IX_ShipmentChanges_TenantId_ShipmentId_Id",
                table: "ShipmentChanges",
                columns: new[] { "TenantId", "ShipmentId", "Id" });

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_OutboundShipments_TenantId_ShipmentId",
                table: "StockMovements",
                columns: new[] { "TenantId", "ShipmentId" },
                principalTable: "OutboundShipments",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_OutboundShipments_TenantId_ShipmentId",
                table: "StockMovements");

            migrationBuilder.DropTable(
                name: "ShipmentAllocations");

            migrationBuilder.DropTable(
                name: "ShipmentChanges");

            migrationBuilder.DropTable(
                name: "OutboundShipmentLines");

            migrationBuilder.DropTable(
                name: "OutboundShipments");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_ShipmentId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_TenantId_StockId_ShipmentId",
                table: "StockMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Source",
                table: "StockMovements");

            migrationBuilder.DropColumn(
                name: "ShipmentId",
                table: "StockMovements");

            migrationBuilder.AlterColumn<Guid>(
                name: "ReceiptId",
                table: "StockMovements",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
