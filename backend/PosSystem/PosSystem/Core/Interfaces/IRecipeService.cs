using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IRecipeService
{
    Task<IReadOnlyList<RecipeLineDto>> GetRecipeAsync(string productId);
    Task SetRecipeAsync(string productId, IEnumerable<RecipeLineRequest> lines);
}
