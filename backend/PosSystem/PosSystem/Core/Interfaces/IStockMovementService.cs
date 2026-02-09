using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IStockMovementService
{
    Task<IEnumerable<StockMovement>> GetAllMovementsAsync();
    Task<StockMovement?> GetMovementByIdAsync(string id);
    Task<IEnumerable<StockMovement>> GetMovementsByIngredientIdAsync(string ingredientId);
    Task<IEnumerable<StockMovement>> GetMovementsByDateRangeAsync(DateTime startDate, DateTime endDate);
    Task<StockMovement> CreateMovementAsync(StockMovement stockMovement);
    Task DeleteMovementAsync(string id);
}




