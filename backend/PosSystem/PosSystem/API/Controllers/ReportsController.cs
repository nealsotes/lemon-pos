using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class ReportsController : ControllerBase
{
    private readonly IReportingService _reportingService;

    public ReportsController(IReportingService reportingService)
    {
        _reportingService = reportingService;
    }

    [HttpGet("daily")]
    public async Task<ActionResult<object>> GetDailyReport()
    {
        var today = DateTime.UtcNow.Date;
        var report = await _reportingService.GetDailyReportAsync(today);
        return Ok(report);
    }

    [HttpGet("daily/{date:datetime}")]
    public async Task<ActionResult<object>> GetDailyReportByDate(DateTime date)
    {
        var report = await _reportingService.GetDailyReportAsync(date);
        return Ok(report);
    }

    [HttpGet("sales")]
    public async Task<ActionResult<object>> GetSalesReport(
        [FromQuery] DateTime startDate, 
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetSalesReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("top-products")]
    public async Task<ActionResult<object>> GetTopSellingProducts(
        [FromQuery] DateTime startDate, 
        [FromQuery] DateTime endDate, 
        [FromQuery] int count = 10)
    {
        var report = await _reportingService.GetTopSellingProductsAsync(startDate, endDate, count);
        return Ok(report);
    }

    [HttpGet("category")]
    public async Task<ActionResult<object>> GetCategoryReport(
        [FromQuery] DateTime startDate, 
        [FromQuery] DateTime endDate)
    {
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
        var report = await _reportingService.GetProfitLossReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("inventory-valuation")]
    public async Task<ActionResult<object>> GetInventoryValuationReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetInventoryValuationReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("accountant-summary")]
    public async Task<ActionResult<object>> GetAccountantSummaryReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetAccountantSummaryAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("supplier-breakdown")]
    public async Task<ActionResult<SupplierBreakdownReportDto>> GetSupplierBreakdown(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetSupplierBreakdownAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("consumption")]
    public async Task<ActionResult<ConsumptionReportDto>> GetConsumptionReport(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetConsumptionReportAsync(startDate, endDate);
        return Ok(report);
    }

    [HttpGet("period-comparison")]
    public async Task<ActionResult<PeriodComparisonDto>> GetPeriodComparison(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var report = await _reportingService.GetPeriodComparisonAsync(startDate, endDate);
        return Ok(report);
    }
}