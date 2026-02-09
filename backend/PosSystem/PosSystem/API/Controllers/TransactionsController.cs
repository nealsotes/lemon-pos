using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
        _transactionService = transactionService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Transaction>>> GetTransactions()
    {
        var transactions = await _transactionService.GetAllTransactionsAsync();
        return Ok(transactions);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Transaction>> GetTransaction(int id)
    {
        var transaction = await _transactionService.GetTransactionByIdAsync(id);
        if (transaction == null)
        {
            return NotFound();
        }
        return Ok(transaction);
    }

    [HttpPost]
    public async Task<ActionResult<Transaction>> CreateTransaction([FromBody] Transaction transaction)
    {
        try
        {
            // Check model validation errors first
            if (!ModelState.IsValid)
            {
                var errors = ModelState
                    .Where(x => x.Value?.Errors.Count > 0)
                    .SelectMany(x => x.Value?.Errors.Select(e => $"{x.Key}: {e.ErrorMessage}") ?? new List<string>())
                    .ToList();
                
                return BadRequest(new { message = "Validation failed", errors = errors });
            }
            
            // Validate transaction
            if (transaction == null)
            {
                return BadRequest(new { message = "Transaction data is required or could not be parsed" });
            }

            if (transaction.Items == null || transaction.Items.Count == 0)
            {
                return BadRequest(new { message = "Transaction must contain at least one item" });
            }

            // Validate each item
            foreach (var item in transaction.Items)
            {
                if (string.IsNullOrEmpty(item.ProductId))
                {
                    return BadRequest(new { message = $"Item '{item.Name}' is missing ProductId" });
                }
                if (item.Quantity <= 0)
                {
                    return BadRequest(new { message = $"Item '{item.Name}' has invalid quantity: {item.Quantity}" });
                }
            }

            // Normalize serviceType if it comes as string (handle camelCase from frontend)
            // The JsonStringEnumConverter should handle this, but let's be safe
            if (transaction.ServiceType == default(ServiceType))
            {
                transaction.ServiceType = ServiceType.DineIn; // Default
            }

            var createdTransaction = await _transactionService.CreateTransactionAsync(transaction);
            return CreatedAtAction(nameof(GetTransaction), new { id = createdTransaction.Id }, createdTransaction);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"An error occurred: {ex.Message}" });
        }
    }

    [HttpGet("date/{date:datetime}")]
    public async Task<ActionResult<IEnumerable<Transaction>>> GetTransactionsByDate(DateTime date)
    {
        var transactions = await _transactionService.GetTransactionsByDateAsync(date);
        return Ok(transactions);
    }

    [HttpGet("range")]
    public async Task<ActionResult<IEnumerable<Transaction>>> GetTransactionsByDateRange(
        [FromQuery] DateTime startDate, 
        [FromQuery] DateTime endDate)
    {
        var transactions = await _transactionService.GetTransactionsByDateRangeAsync(startDate, endDate);
        return Ok(transactions);
    }

    [HttpGet("sales/{date:datetime}")]
    public async Task<ActionResult<decimal>> GetTotalSales(DateTime date)
    {
        var totalSales = await _transactionService.GetTotalSalesAsync(date);
        return Ok(totalSales);
    }
} 