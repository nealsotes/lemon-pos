using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Admin")]
public class RecipesController : ControllerBase
{
    private readonly IRecipeService _recipeService;

    public RecipesController(IRecipeService recipeService)
    {
        _recipeService = recipeService;
    }

    [HttpGet("product/{productId}")]
    public async Task<ActionResult<IReadOnlyList<RecipeLineDto>>> GetRecipe(string productId)
    {
        try
        {
            var recipe = await _recipeService.GetRecipeAsync(productId);
            return Ok(recipe);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("product/{productId}")]
    public async Task<ActionResult> SetRecipe(string productId, [FromBody] RecipeUpdateRequest request)
    {
        try
        {
            await _recipeService.SetRecipeAsync(productId, request?.Lines ?? new List<RecipeLineRequest>());
            return NoContent();
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
