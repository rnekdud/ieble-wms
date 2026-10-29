using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSingleActiveTenantMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                -- Fail rather than silently repairing historical master counts.
                LOCK TABLE "Tenants", "TenantMemberships", "AspNetUsers" IN SHARE ROW EXCLUSIVE MODE;
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM "Tenants" t
                        LEFT JOIN "TenantMemberships" m ON m."TenantId" = t."Id"
                        LEFT JOIN "AspNetUsers" u ON u."Id" = m."UserId"
                        GROUP BY t."Id"
                        HAVING count(*) FILTER (WHERE m."Role" = 'Master' AND m."IsActive") <> 1
                            OR count(*) FILTER (WHERE m."Role" = 'Master' AND m."IsActive" AND u."IsActive" AND u."SystemRole" = 'None' AND NOT u."MustChangePassword") <> 1
                    ) THEN
                        RAISE EXCEPTION 'Tenant master count requires manual review; migration aborted.' USING ERRCODE = '23514';
                    END IF;
                END $$;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TenantMemberships_OneActiveMaster",
                table: "TenantMemberships",
                column: "TenantId",
                unique: true,
                filter: "\"Role\" = 'Master' AND \"IsActive\" = TRUE");
            migrationBuilder.Sql("""
                CREATE FUNCTION wms_assert_one_master(tenant_id uuid) RETURNS void
                LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
                DECLARE active_count bigint; eligible_count bigint;
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM "Tenants" WHERE "Id" = tenant_id) THEN RETURN; END IF;
                    PERFORM pg_advisory_xact_lock(hashtextextended(tenant_id::text, 0));
                    SELECT count(*) FILTER (WHERE m."Role" = 'Master' AND m."IsActive"),
                           count(*) FILTER (WHERE m."Role" = 'Master' AND m."IsActive" AND u."IsActive" AND u."SystemRole" = 'None' AND NOT u."MustChangePassword")
                      INTO active_count, eligible_count
                      FROM "TenantMemberships" m JOIN "AspNetUsers" u ON u."Id" = m."UserId" WHERE m."TenantId" = tenant_id;
                    IF active_count <> 1 OR eligible_count <> 1 THEN
                        RAISE EXCEPTION 'A tenant must have exactly one active eligible master.'
                            USING ERRCODE = '23514', CONSTRAINT = 'CK_Tenant_ExactlyOneActiveMaster';
                    END IF;
                END $$;
                CREATE FUNCTION wms_membership_master_guard() RETURNS trigger
                LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
                BEGIN
                    IF TG_OP <> 'INSERT' THEN PERFORM wms_assert_one_master(OLD."TenantId"); END IF;
                    IF TG_OP <> 'DELETE' THEN PERFORM wms_assert_one_master(NEW."TenantId"); END IF;
                    RETURN NULL;
                END $$;
                CREATE CONSTRAINT TRIGGER "CT_Membership_ExactlyOneMaster"
                AFTER INSERT OR UPDATE OR DELETE ON "TenantMemberships"
                DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wms_membership_master_guard();
                CREATE FUNCTION wms_tenant_master_guard() RETURNS trigger
                LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
                BEGIN PERFORM wms_assert_one_master(NEW."Id"); RETURN NULL; END $$;
                CREATE CONSTRAINT TRIGGER "CT_Tenant_ExactlyOneMaster"
                AFTER INSERT ON "Tenants" DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION wms_tenant_master_guard();
                CREATE FUNCTION wms_user_master_guard() RETURNS trigger
                LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
                DECLARE tenant_id uuid;
                BEGIN
                    FOR tenant_id IN SELECT "TenantId" FROM "TenantMemberships" WHERE "UserId" = NEW."Id" AND "Role" = 'Master' ORDER BY "TenantId"
                    LOOP PERFORM wms_assert_one_master(tenant_id); END LOOP;
                    RETURN NULL;
                END $$;
                CREATE CONSTRAINT TRIGGER "CT_User_ActiveMaster"
                AFTER UPDATE OF "IsActive", "SystemRole", "MustChangePassword" ON "AspNetUsers"
                DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wms_user_master_guard();
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER "CT_User_ActiveMaster" ON "AspNetUsers";
                DROP TRIGGER "CT_Tenant_ExactlyOneMaster" ON "Tenants";
                DROP TRIGGER "CT_Membership_ExactlyOneMaster" ON "TenantMemberships";
                DROP FUNCTION wms_user_master_guard();
                DROP FUNCTION wms_tenant_master_guard();
                DROP FUNCTION wms_membership_master_guard();
                DROP FUNCTION wms_assert_one_master(uuid);
                """);
            migrationBuilder.DropIndex(
                name: "IX_TenantMemberships_OneActiveMaster",
                table: "TenantMemberships");
        }
    }
}
