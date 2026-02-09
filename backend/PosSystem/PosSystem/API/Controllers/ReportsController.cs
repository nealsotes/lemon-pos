using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;

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
        var today = DateTime.Today;
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
}