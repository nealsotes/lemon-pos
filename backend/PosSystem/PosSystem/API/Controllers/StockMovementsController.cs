using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class StockMovementsController : ControllerBase
{
    private readonly IStockMovementService _stockMovementService;

    public StockMovementsController(IStockMovementService stockMovementService)
    {
        _stockMovementService = stockMovementService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<StockMovement>>> GetStockMovements(
        [FromQuery] string? ingredientId = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        try
        {
            IEnumerable<StockMovement> movements;

            if (!string.IsNullOrEmpty(ingredientId))
            {
                movements = await _stockMovementService.GetMovementsByIngredientIdAsync(ingredientId);
            }
            else if (startDate.HasValue && endDate.HasValue)
            {
                movements = await _stockMovementService.GetMovementsByDateRangeAsync(startDate.Value, endDate.Value);
            }
            else
            {
                movements = await _stockMovementService.GetAllMovementsAsync();
            }

            return Ok(movements);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving stock movements: {ex.Message}");
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<StockMovement>> GetStockMovement(string id)
    {
        try
        {
            var movement = await _stockMovementService.GetMovementByIdAsync(id);
            if (movement == null)
            {
                return NotFound($"Stock movement with ID {id} not found");
            }
            return Ok(movement);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving stock movement: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<ActionResult<StockMovement>> CreateStockMovement([FromBody] StockMovement stockMovement)
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

            var createdMovement = await _stockMovementService.CreateMovementAsync(stockMovement);
            return CreatedAtAction(nameof(GetStockMovement), new { id = createdMovement.Id }, createdMovement);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error creating stock movement: {ex.Message}");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteStockMovement(string id)
    {
        try
        {
            await _stockMovementService.DeleteMovementAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error deleting stock movement: {ex.Message}");
        }
    }
}




