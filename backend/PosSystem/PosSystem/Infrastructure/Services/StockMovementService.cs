using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class StockMovementService : IStockMovementService
{
    private readonly IStockMovementRepository _stockMovementRepository;

    public StockMovementService(IStockMovementRepository stockMovementRepository)
    {
        _stockMovementRepository = stockMovementRepository;
    }

    public async Task<IEnumerable<StockMovement>> GetAllMovementsAsync()
    {
        return await _stockMovementRepository.GetAllAsync();
    }

    public async Task<StockMovement?> GetMovementByIdAsync(string id)
    {
        return await _stockMovementRepository.GetByIdAsync(id);
    }

    public async Task<IEnumerable<StockMovement>> GetMovementsByIngredientIdAsync(string ingredientId)
    {
        return await _stockMovementRepository.GetByIngredientIdAsync(ingredientId);
    }

    public async Task<IEnumerable<StockMovement>> GetMovementsByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        return await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate);
    }

    public async Task<StockMovement> CreateMovementAsync(StockMovement stockMovement)
    {
        // Validate quantity
        if (stockMovement.Quantity == 0)
        {
            throw new ArgumentException("Quantity cannot be zero");
        }

        // Validate movement type
        if (!Enum.IsDefined(typeof(MovementType), stockMovement.MovementType))
        {
            throw new ArgumentException("Invalid movement type");
        }

        return await _stockMovementRepository.AddAsync(stockMovement);
    }

    public async Task DeleteMovementAsync(string id)
    {
        await _stockMovementRepository.DeleteAsync(id);
    }
}




