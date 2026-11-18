using System.Diagnostics;
using System.Text.Json;
using IebleWms.Api.Models;
using IebleWms.Api.Shipping;
using Xunit;
namespace IebleWms.Api.Tests;

// Compare the client route length with the existing server free-floor calculation,
// rather than accepting a mocked API path. No database or server is started.
public sealed class BarcodeRouteParityTests
{
    [Theory][InlineData(1.5, false)][InlineData(1.6, true)][InlineData(.8, true)]
    public async Task BrowserPolylineMatchesExistingFreeFloorDistances(double aspect, bool rotated)
    {
        WarehousePlanObject S(string type,double x,double y,double w,double h,Guid? rack=null,double angle=0,string shape="rectangle") => new(){Id=Guid.NewGuid(),Type=type,X=x,Y=y,Width=w,Height=h,RackId=rack,Rotation=angle,Shape=shape};
        var ids=Enumerable.Range(0,6).Select(_=>Guid.NewGuid()).ToArray();
        var objects=new List<WarehousePlanObject>{S("door",.5,.95,.12,.025),S("zone",.5,.5,.9,.9),S("wall",.5,.05,.94,.016),S("wall",.04,.5,.01,.9),S("wall",.96,.5,.01,.9),S("wall",.24,.95,.4,.016),S("wall",.76,.95,.4,.016),S("aisle",.5,.5,.86,.1)};
        for(var i=0;i<6;i++)objects.Add(S("rack",new[]{.22,.5,.78}[i%3],i<3?.28:.72,.18,.2,ids[i],rotated&&i==2?20:0));
        if(rotated)objects.Add(S("shape",.35,.5,.04,.1,null,25,"ellipse"));
        var expected=ShipmentRouteOrder.Calculate(objects,aspect,ids,[]);
        var json=await ClientRoutes(new{schemaVersion=1,aspectRatio=aspect,objects},ids);
        Assert.Equal(expected.Distances.Count,json.EnumerateObject().Count());
        foreach(var (id,distance) in expected.Distances){var route=json.GetProperty(id.ToString());Assert.InRange(Math.Abs(route.GetProperty("distance").GetDouble()-distance),0,1e-9);Assert.True(route.GetProperty("points").GetArrayLength()>=2);}
    }
    internal static async Task<JsonElement> ClientRoutes(object plan,Guid[] ids)
    {
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"frontend/tests/barcode-route-oracle.mjs")))root=root.Parent;
        Assert.NotNull(root);
        var start=new ProcessStartInfo("node"){RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false};
        start.ArgumentList.Add("--experimental-strip-types");start.ArgumentList.Add(Path.Combine(root.FullName,"frontend/tests/barcode-route-oracle.mjs"));
        using var process=Process.Start(start)!;
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new{plan,ids},new JsonSerializerOptions(JsonSerializerDefaults.Web)));process.StandardInput.Close();
        var output=await process.StandardOutput.ReadToEndAsync();var error=await process.StandardError.ReadToEndAsync();await process.WaitForExitAsync();Assert.True(process.ExitCode==0,error);
        using var json=JsonDocument.Parse(output);return json.RootElement.Clone();
    }
}
