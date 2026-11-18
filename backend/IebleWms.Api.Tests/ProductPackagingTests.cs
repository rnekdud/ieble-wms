using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
namespace IebleWms.Api.Tests;
public static class ProductPackagingScenario
{
    public static async Task Run(HttpClient c,string root)
    {
        static Guid Id(JsonElement e)=>e.GetProperty("id").GetGuid();
        static Guid V(JsonElement e)=>e.GetProperty("version").GetGuid();
        async Task<JsonElement> Get(string path)=>await c.GetFromJsonAsync<JsonElement>(path);
        async Task<JsonElement> Post(string path,object body){var response=await AuthTests.Post(c,path,body);Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());return await response.Content.ReadFromJsonAsync<JsonElement>();}
        async Task FractionRejected(string path,object body){var response=await AuthTests.Post(c,path,body);Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Contains("EA",await response.Content.ReadAsStringAsync());}
        var suffix=Guid.NewGuid().ToString("N")[..8];var productUrl=root+"/products";
        var p=await Post(productUrl,new{requestId=Guid.NewGuid(),name="비쵸비 "+suffix,innerPackQuantity=10,outerPackQuantity=5,palletPackQuantity=20,barcodes=new[]{new{change=new{mode="manual",value="EA-"+suffix},packageCode="EA",isPrimary=true},new{change=new{mode="manual",value="INNER-"+suffix},packageCode="INNER",isPrimary=false},new{change=new{mode="manual",value="OUTER-"+suffix},packageCode="OUTER",isPrimary=false},new{change=new{mode="manual",value="PALLET-"+suffix},packageCode="PALLET",isPrimary=false}}});
        Assert.Equal("EA",p.GetProperty("unit").GetString());
        var labels=(await Get(productUrl+"/"+Id(p))).GetProperty("product").GetProperty("barcodes");
        Assert.Equal(4,labels.GetArrayLength());
        Assert.Contains(labels.EnumerateArray(),b=>b.GetProperty("packageCode").GetString()=="PALLET");
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,productUrl,new{requestId=Guid.NewGuid(),name="fraction",innerPackQuantity=1.5})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,productUrl,new{requestId=Guid.NewGuid(),name="unconfigured",barcodes=new[]{new{change=new{mode="manual",value="INVALID-"+suffix},packageCode="PALLET"}}})).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,productUrl,new{requestId=Guid.NewGuid(),name="invalid",unit="kg"})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await AuthTests.Post(c,productUrl,new{requestId=Guid.NewGuid(),name="invalid",innerPackQuantity=0})).StatusCode);
        var direct=await Post(productUrl,new{requestId=Guid.NewGuid(),name="직접 포장",outerPackUnit="EA",outerPackQuantity=24});Assert.Equal(24,direct.GetProperty("outerPackQuantity").GetInt32());
        var w=await Post(root+"/warehouses",new{name="Pack "+suffix});var rack=await Post(root+"/warehouses/"+Id(w)+"/racks",new{code="PACK",name="PACK",levels=1,bays=1});var loc=Id((await Get(root+"/warehouses/"+Id(w)+"/racks/"+Id(rack)+"/front")).GetProperty("locations")[0].GetProperty("location"));
        var partner=(await Post(root+"/partners",new{requestId=Guid.NewGuid(),name="포장 QA",code="PK-"+suffix,type="BOTH"})).GetProperty("partner");
        var palletReceipt=await Post(root+"/receipts",new{requestId=Guid.NewGuid(),expectedDate="2026-11-06",warehouseId=Id(w),partnerId=Id(partner),contactName="QA",lines=new[]{new{productId=Id(p),expectedQuantity=1000}}});
        var palletUrl=root+"/receipts/"+Id(palletReceipt.GetProperty("receipt"));
        await Post(palletUrl+"/start-inspection",new{version=V(palletReceipt.GetProperty("receipt"))});
        var palletScan=await Post(palletUrl+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="PALLET-"+suffix});
        Assert.Equal(1000,palletScan.GetProperty("detail").GetProperty("lines")[0].GetProperty("inspectedQuantity").GetDecimal());
        Assert.Equal(0,(await Get(palletUrl+"/stock")).GetProperty("balances").GetArrayLength());
        async Task<JsonElement> Receipt()=>await Post(root+"/receipts",new{requestId=Guid.NewGuid(),expectedDate="2026-11-06",warehouseId=Id(w),partnerId=Id(partner),contactName="QA",lines=new[]{new{productId=Id(p),expectedQuantity=100}}});
        await FractionRejected(root+"/receipts",new{requestId=Guid.NewGuid(),expectedDate="2026-11-06",warehouseId=Id(w),partnerId=Id(partner),contactName="QA",lines=new[]{new{productId=Id(p),expectedQuantity=1.5m}}});
        await FractionRejected(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate="2026-11-06",expectedDate="2026-11-06",warehouseId=Id(w),partnerId=Id(partner),contactName="QA",lines=new[]{new{productId=Id(p),requestedQuantity=1.5m}}});
        var receipt=await Receipt();var ru=root+"/receipts/"+Id(receipt.GetProperty("receipt"));
        receipt=await Post(ru+"/start-inspection",new{version=V(receipt.GetProperty("receipt"))});
        async Task<JsonElement> UpdatePack(int inner){var latest=(await Get(productUrl+"/"+Id(p))).GetProperty("product");return await Post(productUrl+"/"+Id(p),new{requestId=Guid.NewGuid(),version=V(latest),name=p.GetProperty("name").GetString(),unit="EA",innerPackQuantity=inner,outerPackQuantity=5,palletPackQuantity=20});}
        await UpdatePack(8); // Existing document must retain 10/50 even after the master changes.
        var scanId=Guid.NewGuid();var scan=await Post(ru+"/scan-inspection",new{requestId=scanId,barcode="OUTER-"+suffix});
        decimal Count(JsonElement value)=>value.GetProperty("detail").GetProperty("lines")[0].GetProperty("inspectedQuantity").GetDecimal();
        Assert.Equal(50,Count(scan));Assert.Equal(50,Count(await Post(ru+"/scan-inspection",new{requestId=scanId,barcode="OUTER-"+suffix})));
        for(var i=0;i<3;i++)scan=await Post(ru+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="INNER-"+suffix});
        for(var i=0;i<5;i++)scan=await Post(ru+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="EA-"+suffix});
        Assert.Equal(85,Count(scan));Assert.Equal("over-limit",(await Post(ru+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="OUTER-"+suffix})).GetProperty("outcome").GetString());
        receipt=scan.GetProperty("detail");var line=Id(receipt.GetProperty("lines")[0]);
        await FractionRejected(ru+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=V(receipt.GetProperty("receipt")),lineId=line,quantity=1.5m,reason="검수 수량 QA"});
        receipt=(await Post(ru+"/inspection-quantity",new{requestId=Guid.NewGuid(),version=V(receipt.GetProperty("receipt")),lineId=line,quantity=100,reason="실물 확인"})).GetProperty("detail");
        receipt=await Post(ru+"/inspection",new{version=V(receipt.GetProperty("receipt")),lines=new[]{new{lineId=line,quantity=100}}});
        Assert.Equal(0,(await Get(ru+"/stock")).GetProperty("balances").GetArrayLength());
        await FractionRejected(ru+"/placements",new{version=V(receipt.GetProperty("receipt")),lines=new[]{new{lineId=line,placements=new[]{new{locationId=loc,quantity=1.5m},new{locationId=loc,quantity=98.5m}}}}});
        receipt=await Post(ru+"/placements",new{version=V(receipt.GetProperty("receipt")),lines=new[]{new{lineId=line,placements=new[]{new{locationId=loc,quantity=100}}}}});
        receipt=await Post(ru+"/confirm",new{version=V(receipt.GetProperty("receipt"))});await Post(ru+"/confirm",new{version=V(receipt.GetProperty("receipt"))});
        var stock=(await Get(ru+"/stock")).GetProperty("balances")[0];Assert.Equal(100,stock.GetProperty("quantity").GetDecimal());Assert.Equal("EA",stock.GetProperty("unit").GetString());
        foreach(var operation in new[]{"move","adjust"})await FractionRejected(root+"/inventory/"+operation,new{requestId=Guid.NewGuid(),stockId=Id(stock),version=V(stock),warehouseId=Id(w),locationId=loc,quantity=1.5m,increase=false,reason="EA 입력 QA",occurredAt=DateTimeOffset.UtcNow});
        await FractionRejected(root+"/stocktakes",new{requestId=Guid.NewGuid(),name="EA 실사 QA",warehouseId=Id(w),scope="Selected",basisAt=DateTimeOffset.UtcNow,contactName="QA",selection=new[]{new{stockId=Id(stock),stockVersion=V(stock),quantity=1.5m,reason="실물 확인"}}});
        var fresh=await Receipt();var fu=root+"/receipts/"+Id(fresh.GetProperty("receipt"));fresh=await Post(fu+"/start-inspection",new{version=V(fresh.GetProperty("receipt"))});Assert.Equal(40,Count(await Post(fu+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="OUTER-"+suffix})));
        await UpdatePack(10);
        var shipment=await Post(root+"/shipments",new{requestId=Guid.NewGuid(),requestDate="2026-11-06",expectedDate="2026-11-06",warehouseId=Id(w),partnerId=Id(partner),contactName="QA",lines=new[]{new{productId=Id(p),requestedQuantity=100}}});
        var su=root+"/shipments/"+Id(shipment.GetProperty("shipment"));shipment=await Post(su+"/start-picking",new{version=V(shipment.GetProperty("shipment"))});
        var allocation=Id(shipment.GetProperty("allocations")[0]);
        await FractionRejected(su+"/picking",new{version=V(shipment.GetProperty("shipment")),complete=false,allocations=new[]{new{allocationId=allocation,quantity=1.5m}}});
        for(var i=0;i<2;i++)shipment=(await Post(su+"/scan-picking",new{requestId=Guid.NewGuid(),barcode="OUTER-"+suffix,allocationId=allocation})).GetProperty("detail");
        shipment=await Post(su+"/picking",new{version=V(shipment.GetProperty("shipment")),complete=true,allocations=new[]{new{allocationId=allocation,quantity=100}}});
        shipment=(await Post(su+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="OUTER-"+suffix,allocationId=allocation})).GetProperty("detail");
        for(var i=0;i<5;i++)shipment=(await Post(su+"/scan-inspection",new{requestId=Guid.NewGuid(),barcode="INNER-"+suffix,allocationId=allocation})).GetProperty("detail");
        Assert.Equal(100,shipment.GetProperty("allocations")[0].GetProperty("inspectedQuantity").GetDecimal());
        await FractionRejected(su+"/inspection",new{version=V(shipment.GetProperty("shipment")),complete=false,allocations=new[]{new{allocationId=allocation,quantity=1.5m}}});
        shipment=await Post(su+"/inspection",new{version=V(shipment.GetProperty("shipment")),complete=true,allocations=new[]{new{allocationId=allocation,quantity=100}}});
        Assert.Equal(100,(await Get(ru+"/stock")).GetProperty("balances")[0].GetProperty("quantity").GetDecimal());
        shipment=await Post(su+"/confirm",new{version=V(shipment.GetProperty("shipment"))});await Post(su+"/confirm",new{version=V(shipment.GetProperty("shipment"))});
        Assert.Equal(0,(await Get(ru+"/stock")).GetProperty("balances")[0].GetProperty("quantity").GetDecimal());
    }
}
public sealed partial class ShipmentTests
{
    [Fact] public async Task EaPackagingEndToEnd(){using var f=new AuthFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await ProductPackagingScenario.Run(c,$"/api/tenants/{t.Tenant}");}
    [ScanPostgresFact] public async Task PostgresEaPackagingEndToEnd(){using var f=new ScanPostgresFactory();using var c=f.Client();var t=await Seed(f);await Login(c,t);await ProductPackagingScenario.Run(c,$"/api/tenants/{t.Tenant}");}
}
