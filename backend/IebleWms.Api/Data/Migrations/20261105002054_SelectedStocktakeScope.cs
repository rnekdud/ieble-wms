using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IebleWms.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SelectedStocktakeScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(name: "CK_Stocktake_Scope", table: "Stocktakes");
            migrationBuilder.AddCheckConstraint(name: "CK_Stocktake_Scope", table: "Stocktakes", sql: "(\"Scope\" IN ('Warehouse','Selected') AND \"ScopeId\" IS NULL) OR (\"Scope\" IN ('Zone','Rack','Location') AND \"ScopeId\" IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(name: "CK_Stocktake_Scope", table: "Stocktakes");
            migrationBuilder.AddCheckConstraint(name: "CK_Stocktake_Scope", table: "Stocktakes", sql: "(\"Scope\" = 'Warehouse' AND \"ScopeId\" IS NULL) OR (\"Scope\" IN ('Zone','Rack','Location') AND \"ScopeId\" IS NOT NULL)");
        }
    }
}
