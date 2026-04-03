using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IIngredientLotService
{
    Task<IEnumerable<IngredientLot>> GetLotsAsync(string ingredientId);
    Task<IngredientLot?> GetLotByIdAsync(string ingredientId, string lotId);
    Task<IngredientLot> CreateLotAsync(string ingredientId, IngredientLotDto dto);
    Task<IngredientLot> UpdateLotAsync(string ingredientId, string lotId, IngredientLotUpdateDto dto);
    Task<List<StockMovement>> DeductFifoAsync(string ingredientId, decimal quantity, MovementType movementType, string? reason = null, string? notes = null);
    Task SyncIngredientAggregatesAsync(string ingredientId);
}
