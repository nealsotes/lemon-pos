using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;

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

    /// <summary>
    /// Creates a sale. The request is the write DTO (roadmap item 2, RC-09): only
    /// the facts of the sale are bindable, and every money figure (item price,
    /// add-on prices, line discounts, total) is resolved/recomputed server-side from
    /// the catalog — a tampered or stale client price cannot book a different sale
    /// than the catalog says. A body timestamp is ignored; offline replays pass the
    /// original sale time in occurredAt instead, which is validated (no future, no
    /// older than the configured backdate window) and honored as the sale time.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Transaction>> CreateTransaction(
        [FromBody] CreateTransactionDto? dto,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKeyHeader)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState
                    .Where(x => x.Value?.Errors.Count > 0)
                    .SelectMany(x => x.Value?.Errors.Select(e => $"{x.Key}: {e.ErrorMessage}") ?? new List<string>())
                    .ToList();

                return BadRequest(new { message = "Validation failed", errors = errors });
            }

            if (dto == null)
            {
                return BadRequest(new { message = "Transaction data is required or could not be parsed" });
            }

            var (createdTransaction, isReplay) = await _transactionService.CreateTransactionFromDtoAsync(dto, idempotencyKeyHeader);

            // A replayed key returns the stored sale as 200 OK; a fresh sale keeps
            // the original 201 Created contract.
            if (isReplay)
            {
                return Ok(createdTransaction);
            }

            return CreatedAtAction(nameof(GetTransaction), new { id = createdTransaction.Id }, createdTransaction);
        }
        catch (IdempotencyKeyConflictException ex)
        {
            return Conflict(new { message = ex.Message, existingTransactionId = ex.ExistingTransactionId });
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
        // The route's bare date is one Philippine business day; the service converts
        // it to the exact UTC window (roadmap item 2, OT-01).
        if (date.Kind == DateTimeKind.Utc)
        {
            date = PhilippineTime.ToWall(date);
        }
        var transactions = await _transactionService.GetTransactionsByDateAsync(date);
        return Ok(transactions);
    }

    [HttpGet("range")]
    public async Task<ActionResult<IEnumerable<Transaction>>> GetTransactionsByDateRange(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        // Query dates are Philippine business days; the wall range becomes the exact
        // UTC half-open window the repository now takes (roadmap item 2, OT-01).
        var startWall = PhilippineTime.ToWall(startDate).Date;
        var endWall = PhilippineTime.ToWall(endDate).Date;
        var transactions = await _transactionService.GetTransactionsByDateRangeAsync(
            PhilippineTime.ToUtc(startWall), PhilippineTime.ToUtc(endWall.AddDays(1)));
        return Ok(transactions);
    }

    [HttpGet("sales/{date:datetime}")]
    public async Task<ActionResult<decimal>> GetTotalSales(DateTime date)
    {
        if (date.Kind == DateTimeKind.Utc)
        {
            date = PhilippineTime.ToWall(date);
        }
        var totalSales = await _transactionService.GetTotalSalesAsync(date);
        return Ok(totalSales);
    }
} 