using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/ingredients/{ingredientId}/lots")]
[Authorize(Roles = "Owner,Admin")]
public class IngredientLotsController : ControllerBase
{
    private readonly IIngredientLotService _lotService;

    public IngredientLotsController(IIngredientLotService lotService)
    {
        _lotService = lotService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<IngredientLot>>> GetLots(string ingredientId)
    {
        try
        {
            var lots = await _lotService.GetLotsAsync(ingredientId);
            return Ok(lots);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving lots: {ex.Message}");
        }
    }

    [HttpGet("{lotId}")]
    public async Task<ActionResult<IngredientLot>> GetLot(string ingredientId, string lotId)
    {
        try
        {
            var lot = await _lotService.GetLotByIdAsync(ingredientId, lotId);
            if (lot == null)
                return NotFound($"Lot {lotId} not found for ingredient {ingredientId}");
            return Ok(lot);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error retrieving lot: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<ActionResult<IngredientLot>> CreateLot(string ingredientId, [FromBody] IngredientLotDto dto)
    {
        try
        {
            var lot = await _lotService.CreateLotAsync(ingredientId, dto);
            return CreatedAtAction(nameof(GetLot), new { ingredientId, lotId = lot.Id }, lot);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error creating lot: {ex.Message}");
        }
    }

    [HttpPut("{lotId}")]
    public async Task<ActionResult<IngredientLot>> UpdateLot(string ingredientId, string lotId, [FromBody] IngredientLotUpdateDto dto)
    {
        try
        {
            var lot = await _lotService.UpdateLotAsync(ingredientId, lotId, dto);
            return Ok(lot);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error updating lot: {ex.Message}");
        }
    }
}
