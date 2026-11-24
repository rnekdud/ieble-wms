using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using IebleWms.Api.Contracts;
using IebleWms.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace IebleWms.Api.Tests;

public sealed partial class ShipmentTests
{
    [Fact]
    public async Task ShippingAddressSnapshotsRemainIndependentAndLegacyEditsPreserveThem()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        var t = await Seed(f); var s = await Setup(f, t); await Login(c, t); await Receive(c, t, s);
        var partnerPath = $"/api/tenants/{t.Tenant}/partners/{s.Partner}";
        var partner = await c.GetFromJsonAsync<JsonElement>(partnerPath);
        var editPartner = new PartnerRequest { RequestId = Guid.NewGuid(), Version = Version(partner), Code = "SUP", Name = "매출처", Type = "BOTH", Address = "사업장", DefaultShippingPostalCode = "12345", DefaultShippingAddress = "안양 출고지", DefaultShippingAddressDetail = "1층" };
        partner = (await Post(c, partnerPath, editPartner, HttpStatusCode.OK)).GetProperty("partner");
        Assert.Equal("12345", partner.GetProperty("defaultShippingPostalCode").GetString());
        Assert.Equal("사업장", partner.GetProperty("address").GetString());
        var choices = await c.GetFromJsonAsync<JsonElement>(Root(t) + "/choices?kind=partners");
        Assert.Equal("12345", choices.GetProperty("items")[0].GetProperty("defaultShippingPostalCode").GetString());
        Assert.Equal("안양 출고지", choices.GetProperty("items")[0].GetProperty("defaultShippingAddress").GetString());
        var request = OutRequest(s); request.ShippingPostalCode = "01234"; request.ShippingAddress = "서울 출고지"; request.ShippingAddressDetail = "물류동";
        var doc = await Post(c, Root(t), request); var path = Root(t) + "/" + Id(Shipment(doc));
        Assert.Equal("서울 출고지", Shipment(doc).GetProperty("shippingAddress").GetString());
        Assert.Equal(Id(Shipment(doc)), Id(Shipment(await Post(c, Root(t), request))));
        editPartner.Version = Version(partner); editPartner.DefaultShippingAddress = "부산 출고지";
        partner = (await Post(c, partnerPath, editPartner, HttpStatusCode.OK)).GetProperty("partner");
        doc = await c.GetFromJsonAsync<JsonElement>(path);
        Assert.Equal("서울 출고지", Shipment(doc).GetProperty("shippingAddress").GetString());
        Assert.Equal("물류동", Shipment(doc).GetProperty("shippingAddressDetail").GetString());
        // Old clients omit the new fields. They must not erase a stored address.
        request.Version = Version(Shipment(doc)); request.ShippingPostalCode = null; request.ShippingAddress = null; request.ShippingAddressDetail = null;
        doc = await Post(c, path, request, HttpStatusCode.OK);
        Assert.Equal("서울 출고지", Shipment(doc).GetProperty("shippingAddress").GetString());
        editPartner.Version = Version(partner); editPartner.DefaultShippingAddress = null; editPartner.DefaultShippingAddressDetail = null;
        partner = (await Post(c, partnerPath, editPartner, HttpStatusCode.OK)).GetProperty("partner");
        Assert.Equal("부산 출고지", partner.GetProperty("defaultShippingAddress").GetString());
        // Explicit empty input clears optional addresses; it does not refill from a default.
        request.Version = Version(Shipment(doc)); Assert.Equal("01234", Shipment(doc).GetProperty("shippingPostalCode").GetString());
        request.ShippingPostalCode = ""; request.ShippingAddress = ""; request.ShippingAddressDetail = "";
        doc = await Post(c, path, request, HttpStatusCode.OK);
        Assert.Equal(JsonValueKind.Null, Shipment(doc).GetProperty("shippingAddress").ValueKind);
        Assert.Equal(JsonValueKind.Null, Shipment(doc).GetProperty("shippingPostalCode").ValueKind);
        editPartner.Version = Version(partner); editPartner.DefaultShippingAddress = ""; editPartner.DefaultShippingAddressDetail = "";
        partner = (await Post(c, partnerPath, editPartner, HttpStatusCode.OK)).GetProperty("partner");
        Assert.Equal(JsonValueKind.Null, partner.GetProperty("defaultShippingAddress").ValueKind);
        request.Version = Version(Shipment(doc)); request.ShippingAddress = new string('a', 501);
        Assert.Equal(HttpStatusCode.BadRequest, (await AuthTests.Post(c, path, request)).StatusCode);
        var noAddress = await Post(c, Root(t), OutRequest(s, 1));
        Assert.Equal(JsonValueKind.Null, Shipment(noAddress).GetProperty("shippingAddress").ValueKind);
        using var scope = f.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WmsDbContext>();
        Assert.Equal(9.25m, (await db.StockBalances.SingleAsync()).Quantity);
        Assert.Equal(4m, (await db.StockBalances.SingleAsync()).ReservedQuantity);
    }

    [Fact]
    public async Task ShippingAddressesRespectTenantAndStatePermissions()
    {
        using var f = new AuthFactory(); using var c = f.Client();
        var t = await Seed(f); var s = await Setup(f, t); await Login(c, t); await Receive(c, t, s);
        var request = OutRequest(s); request.ShippingAddress = "격리 주소";
        var doc = await Post(c, Root(t), request); var id = Id(Shipment(doc));
        doc = await Action(c, t, doc, "start-picking"); request.Version = Version(Shipment(doc));
        Assert.Equal(HttpStatusCode.Conflict, (await AuthTests.Post(c, Root(t) + "/" + id, request)).StatusCode);
        await Login(c, t, "Other");
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync(Root(t) + "/choices?kind=partners")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/api/tenants/{t.Other}/shipments/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/api/tenants/{t.Other}/partners/{s.Partner}")).StatusCode);
        Assert.Equal(0, (await c.GetFromJsonAsync<JsonElement>($"/api/tenants/{t.Other}/shipments/choices?kind=partners")).GetProperty("total").GetInt32());
        await Login(c, t, "Reader");
        Assert.Equal(HttpStatusCode.Forbidden, (await AuthTests.Post(c, Root(t), request)).StatusCode);
    }
}
