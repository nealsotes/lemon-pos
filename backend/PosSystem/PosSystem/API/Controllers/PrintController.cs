using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PrintController : ControllerBase
{
    private readonly IPrintService _printService;
    private readonly ILogger<PrintController> _logger;

    public PrintController(IPrintService printService, ILogger<PrintController> logger)
    {
        _printService = printService;
        _logger = logger;
    }

    [HttpPost("receipt")]
    public async Task<IActionResult> PrintReceipt([FromBody] ReceiptData receiptData, [FromQuery] bool openDrawer = true)
    {
        try
        {
            var success = await _printService.PrintReceiptAsync(receiptData, openDrawer);
            
            if (success)
            {
                return Ok(new { success = true, message = "Receipt printed successfully" });
            }
            else
            {
                return BadRequest(new { success = false, message = "Failed to print receipt. Check printer configuration." });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error printing receipt");
            return StatusCode(500, new { success = false, message = "Internal server error while printing" });
        }
    }

    [HttpPost("drawer")]
    public async Task<IActionResult> OpenCashDrawer([FromQuery] string? printerName = null)
    {
        try
        {
            var success = await _printService.OpenCashDrawerAsync(printerName);
            
            if (success)
            {
                return Ok(new { success = true, message = "Cash drawer opened" });
            }
            else
            {
                return BadRequest(new { success = false, message = "Failed to open cash drawer" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error opening cash drawer");
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    [HttpGet("printers")]
    public async Task<IActionResult> GetAvailablePrinters()
    {
        try
        {
            var printers = await _printService.GetAvailablePrintersAsync();
            return Ok(new { printers });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting printers");
            return StatusCode(500, new { message = "Error getting printer list" });
        }
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestPrint([FromQuery] string? printerName = null)
    {
        try
        {
            // First, check if we have any printers available
            var availablePrinters = await _printService.GetAvailablePrintersAsync();
            
            if (availablePrinters.Count == 0)
            {
                return BadRequest(new { 
                    success = false, 
                    message = "No printers found. Please connect a printer and ensure it's installed in Windows." 
                });
            }

            // If no printer name specified, use first available or configured one
            if (string.IsNullOrEmpty(printerName))
            {
                printerName = availablePrinters.FirstOrDefault();
                _logger.LogInformation($"Using default printer: {printerName}");
            }
            else if (!availablePrinters.Contains(printerName))
            {
                return BadRequest(new { 
                    success = false, 
                    message = $"Printer '{printerName}' not found. Available printers: {string.Join(", ", availablePrinters)}" 
                });
            }

            var success = await _printService.TestPrintAsync(printerName);
            
            if (success)
            {
                return Ok(new { success = true, message = $"Test receipt printed successfully to {printerName}" });
            }
            else
            {
                return BadRequest(new { 
                    success = false, 
                    message = $"Failed to print test receipt to '{printerName}'. Check printer connection and ensure it's powered on." 
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error printing test receipt");
            return StatusCode(500, new { 
                success = false, 
                message = $"Internal server error: {ex.Message}" 
            });
        }
    }
}

