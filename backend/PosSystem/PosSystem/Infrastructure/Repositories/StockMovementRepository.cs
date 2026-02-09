using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class StockMovementRepository : IStockMovementRepository
{
    private readonly PosSystemDbContext _context;

    public StockMovementRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<StockMovement>> GetAllAsync()
    {
        return await _context.StockMovements
            .OrderByDescending(sm => sm.CreatedAt)
            .ToListAsync();
    }

    public async Task<StockMovement?> GetByIdAsync(string id)
    {
        return await _context.StockMovements
            .FirstOrDefaultAsync(sm => sm.Id == id);
    }

    public async Task<IEnumerable<StockMovement>> GetByIngredientIdAsync(string ingredientId)
    {
        return await _context.StockMovements
            .Where(sm => sm.IngredientId == ingredientId)
            .OrderByDescending(sm => sm.CreatedAt)
            .ToListAsync();
    }

    public async Task<IEnumerable<StockMovement>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        return await _context.StockMovements
            .Where(sm => sm.CreatedAt >= startDate && sm.CreatedAt <= endDate)
            .OrderByDescending(sm => sm.CreatedAt)
            .ToListAsync();
    }

    public async Task<StockMovement> AddAsync(StockMovement stockMovement)
    {
        if (string.IsNullOrWhiteSpace(stockMovement.Id))
        {
            stockMovement.Id = Guid.NewGuid().ToString();
        }
        
        stockMovement.CreatedAt = DateTime.UtcNow;
        
        _context.StockMovements.Add(stockMovement);
        await _context.SaveChangesAsync();
        return stockMovement;
    }

    public async Task DeleteAsync(string id)
    {
        var stockMovement = await GetByIdAsync(id);
        if (stockMovement != null)
        {
            _context.StockMovements.Remove(stockMovement);
            await _context.SaveChangesAsync();
        }
    }
}




