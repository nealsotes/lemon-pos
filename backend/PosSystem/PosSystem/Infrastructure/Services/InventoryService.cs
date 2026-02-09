using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace PosSystem.Infrastructure.Services;

public class InventoryService : IInventoryService
{
    private readonly PosSystemDbContext _context;

    public InventoryService(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<bool> CheckStockAvailabilityAsync(string productId, int quantity)
    {
        var product = await _context.Products
            .FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        
        return product != null && product.Stock >= quantity;
    }

    public async Task UpdateStockAsync(string productId, int quantity)
    {
        var product = await _context.Products
            .FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        
        if (product == null)
        {
            throw new ArgumentException($"Product with ID {productId} not found");
        }

        product.Stock += quantity;
        product.UpdatedAt = DateTime.UtcNow;

        if (product.Stock < 0)
        {
            throw new InvalidOperationException($"Cannot reduce stock below 0 for product {product.Name}");
        }

        await _context.SaveChangesAsync();
    }

    public async Task<int> GetCurrentStockAsync(string productId)
    {
        var product = await _context.Products
            .FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        
        return product?.Stock ?? 0;
    }

    public async Task<IEnumerable<object>> GetLowStockProductsAsync(int threshold = 10)
    {
        var lowStockProducts = await _context.Products
            .Where(p => p.Stock <= threshold && p.IsActive)
            .Select(p => new
            {
                p.Id,
                p.Name,
                p.Stock,
                p.Category,
                p.Price
            })
            .ToListAsync();

        return lowStockProducts;
    }
} 