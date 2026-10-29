using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrganizationStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DepartmentId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PositionId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Departments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Departments", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Department_Name", "length(trim(\"Name\")) > 0");
                    table.CheckConstraint("CK_Department_Order", "\"SortOrder\" >= 0");
                    table.CheckConstraint("CK_Department_Parent", "\"ParentId\" IS NULL OR \"ParentId\" <> \"Id\"");
                    table.ForeignKey(
                        name: "FK_Departments_Departments_TenantId_ParentId",
                        columns: x => new { x.TenantId, x.ParentId },
                        principalTable: "Departments",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Departments_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "JobPositions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobPositions", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Position_Name", "length(trim(\"Name\")) > 0");
                    table.CheckConstraint("CK_Position_Order", "\"SortOrder\" >= 0");
                    table.ForeignKey(
                        name: "FK_JobPositions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_DepartmentId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "DepartmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_PositionId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PositionId" });

            migrationBuilder.CreateIndex(
                name: "IX_Departments_TenantId_NormalizedName",
                table: "Departments",
                columns: new[] { "TenantId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Departments_TenantId_ParentId",
                table: "Departments",
                columns: new[] { "TenantId", "ParentId" });

            migrationBuilder.CreateIndex(
                name: "IX_JobPositions_TenantId_NormalizedName",
                table: "JobPositions",
                columns: new[] { "TenantId", "NormalizedName" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_Departments_TenantId_DepartmentId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "DepartmentId" },
                principalTable: "Departments",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_JobPositions_TenantId_PositionId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "PositionId" },
                principalTable: "JobPositions",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
                migrationBuilder.Sql("""
                    CREATE FUNCTION "ValidateDepartmentHierarchy"() RETURNS trigger LANGUAGE plpgsql AS $$
                    DECLARE has_cycle boolean;
                    BEGIN
                      PERFORM pg_advisory_xact_lock(hashtextextended(NEW."TenantId"::text, 0));
                      IF NEW."ParentId" IS NOT NULL THEN
                        EXECUTE format('WITH RECURSIVE ancestors AS (
                          SELECT "Id", "ParentId" FROM %I."Departments" WHERE "TenantId" = $1 AND "Id" = $2
                          UNION
                          SELECT p."Id", p."ParentId" FROM %I."Departments" p JOIN ancestors a ON p."Id" = a."ParentId" WHERE p."TenantId" = $1
                        ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE "Id" = $3)', TG_TABLE_SCHEMA, TG_TABLE_SCHEMA)
                        INTO has_cycle USING NEW."TenantId", NEW."ParentId", NEW."Id";
                        IF has_cycle THEN RAISE EXCEPTION 'Department hierarchy cycle' USING ERRCODE = '23514'; END IF;
                      END IF;
                      RETURN NEW;
                    END;
                    $$;
                    CREATE TRIGGER "TR_Departments_NoCycle" BEFORE INSERT OR UPDATE OF "ParentId", "TenantId" ON "Departments"
                    FOR EACH ROW EXECUTE FUNCTION "ValidateDepartmentHierarchy"();
                    """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            if (ActiveProvider == "Npgsql.EntityFrameworkCore.PostgreSQL")
                migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_Departments_NoCycle\" ON \"Departments\"; DROP FUNCTION IF EXISTS \"ValidateDepartmentHierarchy\"();");
            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_Departments_TenantId_DepartmentId",
                table: "TenantMemberships");

            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_JobPositions_TenantId_PositionId",
                table: "TenantMemberships");

            migrationBuilder.DropTable(
                name: "Departments");

            migrationBuilder.DropTable(
                name: "JobPositions");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_DepartmentId",
                table: "TenantMemberships");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_PositionId",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "PositionId",
                table: "TenantMemberships");
        }
    }
}
