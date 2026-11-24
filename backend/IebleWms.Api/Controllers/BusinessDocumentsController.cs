using IebleWms.Api.Organization;
using IebleWms.Api.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace IebleWms.Api.Controllers;

[ApiController, Authorize(Policy="TenantMember")]
[ResponseCache(NoStore=true,Location=ResponseCacheLocation.None)]
[EnableRateLimiting("stock-overview-export")]
public sealed class BusinessDocumentsController(BusinessDocumentService documents):ControllerBase
{
    [HttpGet("api/tenants/{tenantId:guid}/receipts/{id:guid}/documents/{kind}"),Authorize(Policy="Permission:receipts:read")]
    public Task<IActionResult> Receipt(Guid tenantId,Guid id,string kind,[FromQuery]string format="xlsx",[FromQuery]string language="ko",CancellationToken ct=default)
        => Export(()=>documents.Receipt(tenantId,id,kind,ct,language),format,ct);
    [HttpGet("api/tenants/{tenantId:guid}/shipments/{id:guid}/documents/{kind}"),Authorize(Policy="Permission:shipments:read")]
    public Task<IActionResult> Shipment(Guid tenantId,Guid id,string kind,[FromQuery]string format="xlsx",[FromQuery]string language="ko",CancellationToken ct=default)
        => Export(()=>documents.Shipment(tenantId,id,kind,ct,language),format,ct);
    async Task<IActionResult> Export(Func<Task<BusinessDocument>> read,string format,CancellationToken ct)
    {
        if(format is not ("xlsx" or "pdf"))throw new OrganizationException(400,"Excel 또는 PDF 형식을 선택해 주세요.");
        var document=await read();var stream=StockOverviewExport.CreateTemporaryStream();
        try {if(format=="pdf")BusinessDocumentPdf.Write(stream,document,ct);else StockOverviewExport.WriteDocument(stream,document,ct);stream.Position=0;return File(stream,format=="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",document.FileName(format));}
        catch {await stream.DisposeAsync();throw;}
    }
}
