using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCollaboratorPermissionGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CollaboratorId",
                table: "TenantMemberships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UseIndividualPermissions",
                table: "TenantMemberships",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ExternalCollaborators",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PartnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BusinessRegistrationNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Phone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    PermissionsJson = table.Column<string>(type: "text", nullable: false, defaultValue: "{}"),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalCollaborators", x => x.Id);
                    table.UniqueConstraint("AK_ExternalCollaborators_TenantId_Id", x => new { x.TenantId, x.Id });
                    table.CheckConstraint("CK_Collaborator_Name", "length(trim(\"Name\")) > 0");
                    table.ForeignKey(
                        name: "FK_ExternalCollaborators_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalCollaborators_AspNetUsers_UpdatedByUserId",
                        column: x => x.UpdatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalCollaborators_Partners_TenantId_PartnerId",
                        columns: x => new { x.TenantId, x.PartnerId },
                        principalTable: "Partners",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ExternalCollaborators_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CollaboratorPermissionChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CollaboratorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    BeforeJson = table.Column<string>(type: "text", nullable: false),
                    AfterJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CollaboratorPermissionChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CollaboratorPermissionChanges_AspNetUsers_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CollaboratorPermissionChanges_ExternalCollaborators_TenantI~",
                        columns: x => new { x.TenantId, x.CollaboratorId },
                        principalTable: "ExternalCollaborators",
                        principalColumns: new[] { "TenantId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_TenantId_CollaboratorId",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "CollaboratorId" });

            // Preserve old individual grants. Group only by actual PartnerId, never by name.
            migrationBuilder.Sql("""
                CREATE TEMP TABLE collaborator_backfill ON COMMIT DROP AS
                SELECT m.*, md5('ieble-collaborator:' || m."TenantId"::text || ':' ||
                    CASE WHEN m."PartnerId" IS NOT NULL THEN 'partner:' || m."PartnerId"::text ELSE 'user:' || m."UserId"::text END)::uuid AS group_id,
                    '{}'::jsonb AS safe_grants
                FROM "TenantMemberships" m WHERE m."AccountType" = 'External';
                DO $block$
                DECLARE item record; parsed jsonb;
                BEGIN
                    FOR item IN SELECT "TenantId", "UserId", "ExternalPermissionsJson" FROM collaborator_backfill LOOP
                        BEGIN parsed := item."ExternalPermissionsJson"::jsonb; EXCEPTION WHEN OTHERS THEN parsed := '{}'::jsonb; END;
                        IF jsonb_typeof(parsed) <> 'object' THEN parsed := '{}'::jsonb; END IF;
                        UPDATE collaborator_backfill SET safe_grants = parsed WHERE "TenantId" = item."TenantId" AND "UserId" = item."UserId";
                    END LOOP;
                END $block$;
                INSERT INTO "ExternalCollaborators" ("Id", "TenantId", "PartnerId", "Name", "BusinessRegistrationNumber", "Phone", "IsActive", "PermissionsJson", "CreatedAt", "UpdatedAt", "CreatedByUserId", "UpdatedByUserId", "Version")
                SELECT DISTINCT ON (b.group_id) b.group_id, b."TenantId", b."PartnerId", coalesce(p."Name", b."CompanyName"),
                    coalesce(p."BusinessRegistrationNumber", b."BusinessRegistrationNumber"), coalesce(p."Phone", b."CompanyPhone"), true, '{}',
                    b."CreatedAt", b."UpdatedAt", b."CreatedByUserId", b."UpdatedByUserId", md5(b.group_id::text || ':version')::uuid
                FROM collaborator_backfill b LEFT JOIN "Partners" p ON p."TenantId" = b."TenantId" AND p."Id" = b."PartnerId"
                ORDER BY b.group_id, b."CreatedAt", b."UserId";
                WITH actions AS (
                    SELECT b.group_id, f.key, jsonb_agg(DISTINCT a.value) AS allowed
                    FROM collaborator_backfill b CROSS JOIN LATERAL jsonb_each(b.safe_grants) f
                    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(f.value) = 'array' THEN f.value ELSE '[]'::jsonb END) a
                    WHERE jsonb_typeof(a.value) = 'string'
                    GROUP BY b.group_id, f.key
                ), combined AS (SELECT group_id, jsonb_object_agg(key, allowed) AS grants FROM actions GROUP BY group_id)
                UPDATE "ExternalCollaborators" c SET "PermissionsJson" = combined.grants::text FROM combined WHERE c."Id" = combined.group_id;
                UPDATE "TenantMemberships" m SET "CollaboratorId" = b.group_id, "UseIndividualPermissions" = true
                    FROM collaborator_backfill b WHERE m."TenantId" = b."TenantId" AND m."UserId" = b."UserId";
                -- Flush the existing deferred master-membership constraint before ALTER TABLE.
                SET CONSTRAINTS ALL IMMEDIATE;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Memberships_Collaborator",
                table: "TenantMemberships",
                sql: "(\"AccountType\" = 'External' AND \"CollaboratorId\" IS NOT NULL) OR (\"AccountType\" = 'Internal' AND \"CollaboratorId\" IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_CollaboratorPermissionChanges_ChangedByUserId",
                table: "CollaboratorPermissionChanges",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CollaboratorPermissionChanges_TenantId_CollaboratorId_Id",
                table: "CollaboratorPermissionChanges",
                columns: new[] { "TenantId", "CollaboratorId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalCollaborators_CreatedByUserId",
                table: "ExternalCollaborators",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalCollaborators_TenantId_Name",
                table: "ExternalCollaborators",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalCollaborators_TenantId_PartnerId",
                table: "ExternalCollaborators",
                columns: new[] { "TenantId", "PartnerId" },
                unique: true,
                filter: "\"PartnerId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalCollaborators_UpdatedByUserId",
                table: "ExternalCollaborators",
                column: "UpdatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_TenantMemberships_ExternalCollaborators_TenantId_Collaborat~",
                table: "TenantMemberships",
                columns: new[] { "TenantId", "CollaboratorId" },
                principalTable: "ExternalCollaborators",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TenantMemberships_ExternalCollaborators_TenantId_Collaborat~",
                table: "TenantMemberships");

            migrationBuilder.DropTable(
                name: "CollaboratorPermissionChanges");

            migrationBuilder.DropTable(
                name: "ExternalCollaborators");

            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_TenantId_CollaboratorId",
                table: "TenantMemberships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Memberships_Collaborator",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "CollaboratorId",
                table: "TenantMemberships");

            migrationBuilder.DropColumn(
                name: "UseIndividualPermissions",
                table: "TenantMemberships");
        }
    }
}
