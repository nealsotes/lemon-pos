using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IIngredientRepository
{
    Task<IEnumerable<Ingredient>> GetAllAsync();
    Task<Ingredient?> GetByIdAsync(string id);
    Task<Ingredient> AddAsync(Ingredient ingredient);
    Task<Ingredient> UpdateAsync(Ingredient ingredient);
    Task DeleteAsync(string id);
    Task<IEnumerable<Ingredient>> GetLowStockAsync(decimal threshold);
}

