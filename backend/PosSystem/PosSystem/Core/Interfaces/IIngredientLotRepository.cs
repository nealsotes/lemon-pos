using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IIngredientLotRepository
{
    Task<IEnumerable<IngredientLot>> GetActiveByIngredientIdAsync(string ingredientId);
    Task<IngredientLot?> GetByIdAsync(string id);
    Task<IngredientLot> AddAsync(IngredientLot lot);
    Task<IngredientLot> UpdateAsync(IngredientLot lot);
    Task<IEnumerable<IngredientLot>> GetFifoLotsAsync(string ingredientId);
    Task<IEnumerable<IngredientLot>> GetByDateRangeAsync(DateTime startDate, DateTime endDate);
}
