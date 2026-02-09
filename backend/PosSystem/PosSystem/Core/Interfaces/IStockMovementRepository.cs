using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IStockMovementRepository
{
    Task<IEnumerable<StockMovement>> GetAllAsync();
    Task<StockMovement?> GetByIdAsync(string id);
    Task<IEnumerable<StockMovement>> GetByIngredientIdAsync(string ingredientId);
    Task<IEnumerable<StockMovement>> GetByDateRangeAsync(DateTime startDate, DateTime endDate);
    Task<StockMovement> AddAsync(StockMovement stockMovement);
    Task DeleteAsync(string id);
}




