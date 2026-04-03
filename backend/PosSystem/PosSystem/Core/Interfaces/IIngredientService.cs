using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IIngredientService
{
    Task<IEnumerable<Ingredient>> GetAllIngredientsAsync();
    Task<Ingredient?> GetIngredientByIdAsync(string id);
    Task<Ingredient> CreateIngredientAsync(IngredientDto ingredientDto);
    Task<Ingredient> UpdateIngredientAsync(string id, IngredientDto ingredientDto);
    Task DeleteIngredientAsync(string id);
    Task<IEnumerable<Ingredient>> GetLowStockIngredientsAsync(decimal threshold);
    Task<Ingredient> AdjustQuantityAsync(string id, decimal adjustment, string? movementType = null, string? reason = null, string? notes = null, string? supplier = null, decimal? unitCost = null, DateTime? expirationDate = null, string? lotNumber = null);
    Task<IEnumerable<Ingredient>> GetReorderSuggestionsAsync();
    Task<InventoryValueReport> GetInventoryValueAsync();
}

