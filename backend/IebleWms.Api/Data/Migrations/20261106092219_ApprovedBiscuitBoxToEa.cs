using Microsoft.EntityFrameworkCore.Migrations;
#nullable disable
namespace IebleWms.Api.Data.Migrations;
// Explicit owner-approved conversion: this product's BOX represents one saleable EA, not its eight pieces.
public partial class ApprovedBiscuitBoxToEa : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        if(ActiveProvider!="Npgsql.EntityFrameworkCore.PostgreSQL")return;
        migrationBuilder.Sql("""
        DO $$
        DECLARE tenant uuid := '96017713-d6df-4a0e-bee9-7c5e285b2e04';
                product uuid := '9e4f1a69-4d7e-423b-b0b3-b26289f9fd1b';
                actual_unit text;
        BEGIN
          PERFORM pg_advisory_xact_lock(hashtextextended('product:' || tenant::text,0));
          SELECT "Unit" INTO actual_unit FROM "Products" WHERE "TenantId"=tenant AND "Id"=product FOR UPDATE;
          IF actual_unit IS NULL THEN RETURN; END IF;
          IF actual_unit='EA' THEN RETURN; END IF;
          IF actual_unit<>'BOX' OR NOT EXISTS(SELECT 1 FROM "Products" WHERE "TenantId"=tenant AND "Id"=product AND "Code"='PRD-000001' AND "Name"='비쵸비 오리지널 8개입') THEN RAISE EXCEPTION 'Approved product identity/unit changed; conversion aborted'; END IF;
          PERFORM 1 FROM "StockBalances" WHERE "TenantId"=tenant AND "ProductId"=product FOR UPDATE;
          IF (SELECT coalesce(sum("Quantity"),0) FROM "StockBalances" WHERE "TenantId"=tenant AND "ProductId"=product)<>1100 OR EXISTS(SELECT 1 FROM "StockBalances" WHERE "TenantId"=tenant AND "ProductId"=product AND ("Unit"<>'BOX' OR "ReservedQuantity"<>0)) THEN RAISE EXCEPTION 'Approved 1100 BOX baseline changed; conversion aborted'; END IF;
          UPDATE "Products" SET "Unit"='EA',"Version"=gen_random_uuid() WHERE "TenantId"=tenant AND "Id"=product;
          UPDATE "StockBalances" SET "Unit"='EA',"Version"=gen_random_uuid() WHERE "TenantId"=tenant AND "ProductId"=product AND "Unit"='BOX';
          UPDATE "InboundReceipts" SET "Version"=gen_random_uuid() WHERE "TenantId"=tenant AND "Id" IN(SELECT "ReceiptId" FROM "InboundReceiptLines" WHERE "TenantId"=tenant AND "ProductId"=product) AND "Status" NOT IN('Confirmed','Cancelled');
          UPDATE "OutboundShipments" SET "Version"=gen_random_uuid() WHERE "TenantId"=tenant AND "Id" IN(SELECT "ShipmentId" FROM "OutboundShipmentLines" WHERE "TenantId"=tenant AND "ProductId"=product) AND "Status" NOT IN('Confirmed','Cancelled');
          UPDATE "InboundReceiptLines" SET "Unit"='EA' WHERE "TenantId"=tenant AND "ProductId"=product AND "Unit"='BOX';
          UPDATE "OutboundShipmentLines" SET "Unit"='EA' WHERE "TenantId"=tenant AND "ProductId"=product AND "Unit"='BOX';
          UPDATE "InventoryOperations" SET "Unit"='EA' WHERE "TenantId"=tenant AND "ProductId"=product AND "Unit"='BOX';
          UPDATE "StocktakeTargets" SET "Unit"='EA' WHERE "TenantId"=tenant AND "ProductId"=product AND "Unit"='BOX';
          -- Quantities, identifiers, tracking and immutable audit snapshots are deliberately untouched.
        END $$;
        """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)=>throw new NotSupportedException("Do not guess a reverse unit conversion. Restore a verified backup or approve an explicit forward migration.");
}
