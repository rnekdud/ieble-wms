using Xunit;
namespace IebleWms.Api.Tests;
public sealed partial class ShipmentTests
{
    [ScanPostgresFact] public async Task PostgresDashboardAllStockAndRiskPopup()
    {
        using var f=new ScanPostgresFactory();using var c=f.Client();var tenant=await Seed(f);await Login(c,tenant);
        await WarehouseRiskScenario.Run(c,$"/api/tenants/{tenant.Tenant}",f.Services);
    }
}
