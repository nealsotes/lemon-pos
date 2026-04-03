using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/expense-categories")]
[Authorize(Roles = "Owner,Admin")]
public class ExpenseCategoriesController : ControllerBase
{
    private readonly IExpenseService _expenseService;

    public ExpenseCategoriesController(IExpenseService expenseService)
    {
        _expenseService = expenseService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ExpenseCategoryResponseDto>>> GetCategories()
    {
        try
        {
            var categories = await _expenseService.GetCategoriesAsync();
            return Ok(categories);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving expense categories: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<ActionResult<ExpenseCategoryResponseDto>> CreateCategory(ExpenseCategoryDto dto)
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

            var created = await _expenseService.CreateCategoryAsync(dto);
            return CreatedAtAction(nameof(GetCategories), new { id = created.Id }, created);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error creating expense category: {ex.Message}");
        }
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ExpenseCategoryResponseDto>> UpdateCategory(string id, ExpenseCategoryDto dto)
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

            var updated = await _expenseService.UpdateCategoryAsync(id, dto);
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
            return StatusCode(500, $"Error updating expense category: {ex.Message}");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCategory(string id)
    {
        try
        {
            await _expenseService.DeleteCategoryAsync(id);
            return NoContent();
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
            return StatusCode(500, $"Error deleting expense category: {ex.Message}");
        }
    }
}
