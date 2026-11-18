using System.ComponentModel.DataAnnotations;
namespace IebleWms.Api.Reports;
public sealed class StockOverviewOptions
{
 [Range(0,3650)] public int ExpirySoonDays {get;set;}=30;
 [Range(1,100000)] public int MaxExportRows {get;set;}=20000;
 public string TimeZoneId {get;set;}="Asia/Seoul";
}
