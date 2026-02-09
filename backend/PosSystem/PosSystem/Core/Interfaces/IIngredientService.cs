using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IIngredientService
{
    Task<IEnumerable<Ingredient>> GetAllIngredientsAsync();
    Task<Ingredient?> GetIngredientByIdAsync(string id);
    Task<Ingredient> CreateIngredientAsync(Ingredient ingredient);
    Task<Ingredient> UpdateIngredientAsync(string id, Ingredient ingredient);
    Task DeleteIngredientAsync(string id);
    Task<IEnumerable<Ingredient>> GetLowStockIngredientsAsync(decimal threshold);
    Task<Ingredient> AdjustQuantityAsync(string id, decimal adjustment);
    Task<IEnumerable<Ingredient>> GetReorderSuggestionsAsync();
    Task<InventoryValueReport> GetInventoryValueAsync();
}

