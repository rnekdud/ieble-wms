using System.Security.Claims;
using IebleWms.Api.Contracts;
using IebleWms.Api.Warehousing;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IebleWms.Api.Controllers;

[ApiController, Route("api/tenants/{tenantId:guid}/warehouses"), Authorize(Policy = "TenantMember")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class WarehousesController(WarehouseService service) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet, Authorize(Policy = "Permission:warehouses:read")]
    public async Task<IActionResult> List(Guid tenantId, CancellationToken token, string? search = null, string status = "all", int page = 1) => Ok(await service.List(tenantId, search, status, page, token));
    [HttpGet("{warehouseId:guid}"), Authorize(Policy = "Permission:warehouses:read")]
    public async Task<IActionResult> Detail(Guid tenantId, Guid warehouseId, CancellationToken token) => Ok(await service.Detail(tenantId, warehouseId, token));
    [HttpGet("{warehouseId:guid}/locations"), Authorize(Policy = "Permission:warehouses:read")]
    public async Task<IActionResult> Locations(Guid tenantId, Guid warehouseId, CancellationToken token, string? search = null, string status = "all", Guid? zoneId = null, Guid? rackId = null, bool floorOnly = false, int page = 1) =>
        Ok(await service.Locations(tenantId, warehouseId, search, status, zoneId, rackId, floorOnly, page, token));
    [HttpPost, Authorize(Policy = "Permission:warehouses:create")]
    public async Task<IActionResult> Create(Guid tenantId, WarehouseRequest request, CancellationToken token) => StatusCode(201, await service.SaveWarehouse(tenantId, Actor, null, request, token));
    [HttpPost("{warehouseId:guid}"), Authorize(Policy = "Permission:warehouses:update")]
    public async Task<IActionResult> Update(Guid tenantId, Guid warehouseId, WarehouseRequest request, CancellationToken token) => Ok(await service.SaveWarehouse(tenantId, Actor, warehouseId, request, token));
    [HttpPost("{warehouseId:guid}/zones"), Authorize(Policy = "Permission:warehouses:create")]
    public async Task<IActionResult> CreateZone(Guid tenantId, Guid warehouseId, StorageItemRequest request, CancellationToken token) => StatusCode(201, await service.SaveZone(tenantId, warehouseId, Actor, null, request, token));
    [HttpPost("{warehouseId:guid}/zones/{id:guid}"), Authorize(Policy = "Permission:warehouses:update")]
    public async Task<IActionResult> UpdateZone(Guid tenantId, Guid warehouseId, Guid id, StorageItemRequest request, CancellationToken token) => Ok(await service.SaveZone(tenantId, warehouseId, Actor, id, request, token));
    [HttpPost("{warehouseId:guid}/racks"), Authorize(Policy = "Permission:warehouses:create")]
    public async Task<IActionResult> CreateRack(Guid tenantId, Guid warehouseId, RackRequest request, CancellationToken token) => StatusCode(201, await service.SaveRack(tenantId, warehouseId, Actor, null, request, token));
    [HttpPost("{warehouseId:guid}/racks/{id:guid}"), Authorize(Policy = "Permission:warehouses:update")]
    public async Task<IActionResult> UpdateRack(Guid tenantId, Guid warehouseId, Guid id, RackRequest request, CancellationToken token) => Ok(await service.SaveRack(tenantId, warehouseId, Actor, id, request, token));
    [HttpPost("{warehouseId:guid}/locations"), Authorize(Policy = "Permission:warehouses:create")]
    public async Task<IActionResult> CreateLocation(Guid tenantId, Guid warehouseId, CreateLocationRequest request, CancellationToken token) => StatusCode(201, await service.SaveLocation(tenantId, warehouseId, Actor, null, request, request.ZoneId, token));
    [HttpPost("{warehouseId:guid}/locations/{id:guid}"), Authorize(Policy = "Permission:warehouses:update")]
    public async Task<IActionResult> UpdateLocation(Guid tenantId, Guid warehouseId, Guid id, StorageItemRequest request, CancellationToken token) => Ok(await service.SaveLocation(tenantId, warehouseId, Actor, id, request, null, token));
}
