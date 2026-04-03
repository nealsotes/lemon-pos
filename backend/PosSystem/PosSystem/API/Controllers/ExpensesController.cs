using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using System.Security.Claims;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class ExpensesController : ControllerBase
{
    private readonly IExpenseService _expenseService;

    public ExpensesController(IExpenseService expenseService)
    {
        _expenseService = expenseService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExpenseResponseDto>>> GetExpenses(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] string? categoryId)
    {
        try
        {
            var start = startDate ?? DateTime.UtcNow.Date.AddDays(-30);
            var end = endDate ?? DateTime.UtcNow.Date.AddDays(1).AddTicks(-1);

            var expenses = await _expenseService.GetExpensesAsync(start, end, categoryId);
            return Ok(expenses);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving expenses: {ex.Message}");
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ExpenseResponseDto>> GetExpense(string id)
    {
        try
        {
            var expense = await _expenseService.GetExpenseByIdAsync(id);
            if (expense == null) return NotFound($"Expense with id '{id}' not found");
            return Ok(expense);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving expense: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<ActionResult<ExpenseResponseDto>> CreateExpense(ExpenseDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState
                    .Where(x => x.Value?.Errors.Count > 0)
                    .SelectMany(x => x.Value?.Errors.Select(e => $"{x.Key}: {e.ErrorMessage}") ?? new List<string>())
                    .ToList();
                return BadRequest(new { message = "Validation failed", errors });
            }

            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "system";
            var created = await _expenseService.CreateExpenseAsync(dto, userId);
            return CreatedAtAction(nameof(GetExpense), new { id = created.Id }, created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error creating expense: {ex.Message}");
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ExpenseResponseDto>> UpdateExpense(string id, ExpenseDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                var errors = ModelState
                    .Where(x => x.Value?.Errors.Count > 0)
                    .SelectMany(x => x.Value?.Errors.Select(e => $"{x.Key}: {e.ErrorMessage}") ?? new List<string>())
                    .ToList();
                return BadRequest(new { message = "Validation failed", errors });
            }

            var updated = await _expenseService.UpdateExpenseAsync(id, dto);
            return Ok(updated);
        }
        catch (ArgumentException ex)
        {
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error updating expense: {ex.Message}");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExpense(string id)
    {
        try
        {
            await _expenseService.DeleteExpenseAsync(id);
            return NoContent();
        }
        catch (ArgumentException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error deleting expense: {ex.Message}");
        }
    }
}
