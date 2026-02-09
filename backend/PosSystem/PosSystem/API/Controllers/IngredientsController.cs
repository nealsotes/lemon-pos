using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class IngredientsController : ControllerBase
{
    private readonly IIngredientService _ingredientService;

    public IngredientsController(IIngredientService ingredientService)
    {
        _ingredientService = ingredientService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Ingredient>>> GetIngredients()
    {
        try
        {
            var ingredients = await _ingredientService.GetAllIngredientsAsync();
            return Ok(ingredients);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving ingredients: {ex.Message}");
        }
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Ingredient>> GetIngredient(string id)
    {
        try
        {
            var ingredient = await _ingredientService.GetIngredientByIdAsync(id);
            if (ingredient == null)
            {
                return NotFound($"Ingredient with ID {id} not found");
            }
            return Ok(ingredient);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving ingredient: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<ActionResult<Ingredient>> CreateIngredient(IngredientDto ingredientDto)
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

            var ingredient = new Ingredient
            {
                Name = ingredientDto.Name,
                Quantity = ingredientDto.Quantity,
                Unit = ingredientDto.Unit,
                Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? null : ingredientDto.Supplier,
                ExpirationDate = ingredientDto.ExpirationDate,
                LowStockThreshold = ingredientDto.LowStockThreshold,
                UnitCost = ingredientDto.UnitCost,
                LastPurchaseDate = ingredientDto.LastPurchaseDate,
                LastPurchaseCost = ingredientDto.LastPurchaseCost,
                IsActive = ingredientDto.IsActive
            };

            var createdIngredient = await _ingredientService.CreateIngredientAsync(ingredient);
            return CreatedAtAction(nameof(GetIngredient), new { id = createdIngredient.Id }, createdIngredient);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error creating ingredient: {ex.Message}");
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateIngredient(string id, IngredientDto ingredientDto)
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

            var ingredient = new Ingredient
            {
                Id = id,
                Name = ingredientDto.Name,
                Quantity = ingredientDto.Quantity,
                Unit = ingredientDto.Unit,
                Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? null : ingredientDto.Supplier,
                ExpirationDate = ingredientDto.ExpirationDate,
                LowStockThreshold = ingredientDto.LowStockThreshold,
                UnitCost = ingredientDto.UnitCost,
                LastPurchaseDate = ingredientDto.LastPurchaseDate,
                LastPurchaseCost = ingredientDto.LastPurchaseCost,
                IsActive = ingredientDto.IsActive
            };

            var updatedIngredient = await _ingredientService.UpdateIngredientAsync(id, ingredient);
            return Ok(updatedIngredient);
        }
        catch (ArgumentException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error updating ingredient: {ex.Message}");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteIngredient(string id)
    {
        try
        {
            await _ingredientService.DeleteIngredientAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error deleting ingredient: {ex.Message}");
        }
    }

    [HttpGet("low-stock")]
    public async Task<ActionResult<IEnumerable<Ingredient>>> GetLowStockIngredients([FromQuery] decimal? threshold = null)
    {
        try
        {
            var thresholdValue = threshold ?? 0;
            var ingredients = await _ingredientService.GetLowStockIngredientsAsync(thresholdValue);
            return Ok(ingredients);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving low stock ingredients: {ex.Message}");
        }
    }

    [HttpPost("{id}/adjust-quantity")]
    public async Task<ActionResult<Ingredient>> AdjustQuantity(string id, [FromBody] AdjustQuantityRequest request)
    {
        try
        {
            var updatedIngredient = await _ingredientService.AdjustQuantityAsync(id, request.Adjustment);
            return Ok(updatedIngredient);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error adjusting quantity: {ex.Message}");
        }
    }

    [HttpGet("reorder-suggestions")]
    public async Task<ActionResult<IEnumerable<Ingredient>>> GetReorderSuggestions()
    {
        try
        {
            var suggestions = await _ingredientService.GetReorderSuggestionsAsync();
            return Ok(suggestions);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving reorder suggestions: {ex.Message}");
        }
    }

    [HttpGet("reports/value")]
    public async Task<ActionResult<InventoryValueReport>> GetInventoryValue()
    {
        try
        {
            var report = await _ingredientService.GetInventoryValueAsync();
            return Ok(report);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error calculating inventory value: {ex.Message}");
        }
    }

    [HttpGet("reports/value-by-supplier")]
    public async Task<ActionResult<IEnumerable<SupplierValue>>> GetInventoryValueBySupplier()
    {
        try
        {
            var report = await _ingredientService.GetInventoryValueAsync();
            return Ok(report.ValueBySupplier);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error calculating inventory value by supplier: {ex.Message}");
        }
    }
}

public class AdjustQuantityRequest
{
    public decimal Adjustment { get; set; }
}

