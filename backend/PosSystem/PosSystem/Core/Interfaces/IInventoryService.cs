namespace PosSystem.Core.Interfaces;

public interface IInventoryService
{
    Task<bool> CheckStockAvailabilityAsync(string productId, int quantity);
    Task UpdateStockAsync(string productId, int quantity);
    Task<int> GetCurrentStockAsync(string productId);
    Task<IEnumerable<object>> GetLowStockProductsAsync(int threshold = 10);
} 