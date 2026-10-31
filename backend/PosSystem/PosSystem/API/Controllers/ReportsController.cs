using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class ReportsController : ControllerBase
{
    private readonly IReportingService _reportingService;
    private readonly IExportService _exportService;

    public ReportsController(IReportingService reportingService, IExportService exportService)
    {
        _reportingService = reportingService;
        _exportService = exportService;
    }

    [HttpGet("daily")]
    public async Task<ActionResult<object>> GetDailyReport()
    {
        // "Today" is a Philippine business day, not the UTC instant's date — a 07:00
        // PHT dashboard load must not reach back into yesterday (roadmap item 2, OT-01).
        var today = PhilippineTime.Today;
        var report = await _reportingService.GetDailyReportAsync(today);
        return Ok(report);
    }

    [HttpGet("daily/{date:datetime}")]
    public async Task<ActionResult<object>> GetDailyReportByDate(DateTime date)
    {
        // Route-only dates: the query is a bare calendar day; on a datetime URL with
        // no Kind it binds as Unspecified. Treat every reported day as a PH wall date.
        if (date.Kind == DateTimeKind.Utc)
        {
            date = PhilippineTime.ToWall(date);
        }
        var report = await _reportingService.GetDailyReportAsync(date);
        return Ok(report);
    }

    [HttpGet("sales")]
    public async Task<ActionResult<object>> GetSalesReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetSalesReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("top-products")]
    public async Task<ActionResult<object>> GetTopSellingProducts(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate,
        [FromQuery] int count = 10)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetTopSellingProductsAsync(startDate, endDate, count);
        return Ok(report);
    }

    [HttpGet("category")]
    public async Task<ActionResult<object>> GetCategoryReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetCategoryReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("all-time-sales")]
    public async Task<ActionResult<object>> GetAllTimeProductSales()
    {
        var report = await _reportingService.GetAllTimeProductSalesAsync();
        return Ok(report);
    }

    [HttpGet("profit-loss")]
    public async Task<ActionResult<object>> GetProfitLossReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetProfitLossReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("inventory-valuation")]
    public async Task<ActionResult<object>> GetInventoryValuationReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetInventoryValuationReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("accountant-summary")]
    public async Task<ActionResult<object>> GetAccountantSummaryReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetAccountantSummaryAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("supplier-breakdown")]
    public async Task<ActionResult<SupplierBreakdownReportDto>> GetSupplierBreakdown(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetSupplierBreakdownAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("consumption")]
    public async Task<ActionResult<ConsumptionReportDto>> GetConsumptionReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetConsumptionReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("period-comparison")]
    public async Task<ActionResult<PeriodComparisonDto>> GetPeriodComparison(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var report = await _reportingService.GetPeriodComparisonAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("export")]
    public async Task<IActionResult> ExportReport(
        [FromQuery] string section,
        [FromQuery] string format,
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        if (!Enum.TryParse<ExportSection>(section, ignoreCase: true, out var parsedSection))
        {
            return BadRequest($"Invalid section '{section}'. Allowed: full, sales, pnl, inventory, expenses.");
        }
        if (!Enum.TryParse<ExportFormat>(format, ignoreCase: true, out var parsedFormat))
        {
            return BadRequest($"Invalid format '{format}'. Allowed: csv, xlsx.");
        }

        (startDate, endDate) = NormalizeDateRange(startDate, endDate);
        var result = await _exportService.ExportAsync(parsedSection, parsedFormat, startDate, endDate);
        return File(result.Content, result.ContentType, result.FileName);
    }

    /// <summary>
    /// Converts the requested PH business-day range into the canonical UTC half-open
    /// window <c>[startUtc, endUtcExclusive)</c> that covers exactly those calendar
    /// days (roadmap item 2, OT-01).
    ///
    /// The frontend sends the picked wall dates as tz-naive datetimes; they are
    /// Philippine wall dates by definition (the store operates in Manila). The old
    /// normalization treated them as UTC days and left the +8h sales/morning
    /// mis-bucketing everywhere downstream. A caller posting full UTC instants keeps
    /// its exact semantics: the wall-date extraction uses the PH-local reading of
    /// the instant, which for UTC instants equals the instant + 8h.
    /// </summary>
    private static (DateTime start, DateTime end) NormalizeDateRange(DateTime startDate, DateTime endDate)
    {
        var startWall = PhilippineTime.ToWall(startDate).Date;
        var endWall = PhilippineTime.ToWall(endDate).Date;

        // Cover every wall date through endWall, inclusive, in UTC bounds.
        return (PhilippineTime.ToUtc(startWall), PhilippineTime.ToUtc(endWall.AddDays(1)));
    }
}