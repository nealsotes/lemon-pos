using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IProductIngredientRepository
{
    Task<IEnumerable<ProductIngredient>> GetByProductIdAsync(string productId);
    Task<IEnumerable<ProductIngredient>> GetAllWithIngredientsAsync();
}
