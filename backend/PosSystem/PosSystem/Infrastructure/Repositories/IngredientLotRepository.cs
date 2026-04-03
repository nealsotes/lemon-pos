using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class IngredientLotRepository : IIngredientLotRepository
{
    private readonly PosSystemDbContext _context;

    public IngredientLotRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<IngredientLot>> GetActiveByIngredientIdAsync(string ingredientId)
    {
        return await _context.IngredientLots
            .Where(l => l.IngredientId == ingredientId && l.IsActive)
            .OrderBy(l => l.ReceivedAt)
            .ToListAsync();
    }

    public async Task<IngredientLot?> GetByIdAsync(string id)
    {
        return await _context.IngredientLots.FirstOrDefaultAsync(l => l.Id == id);
    }

    public async Task<IngredientLot> AddAsync(IngredientLot lot)
    {
        if (string.IsNullOrWhiteSpace(lot.Id))
        {
            lot.Id = Guid.NewGuid().ToString();
        }

        _context.IngredientLots.Add(lot);
        await _context.SaveChangesAsync();
        return lot;
    }

    public async Task<IngredientLot> UpdateAsync(IngredientLot lot)
    {
        _context.IngredientLots.Update(lot);
        await _context.SaveChangesAsync();
        return lot;
    }

    public async Task<IEnumerable<IngredientLot>> GetFifoLotsAsync(string ingredientId)
    {
        // Order by ReceivedAt ASC (oldest first), then ExpirationDate ASC (nulls last) for tiebreaker
        return await _context.IngredientLots
            .Where(l => l.IngredientId == ingredientId && l.IsActive && l.RemainingQuantity > 0)
            .OrderBy(l => l.ReceivedAt)
            .ThenBy(l => l.ExpirationDate == null ? DateTime.MaxValue : l.ExpirationDate)
            .ToListAsync();
    }

    public async Task<IEnumerable<IngredientLot>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        return await _context.IngredientLots
            .Where(l => l.ReceivedAt >= startDate && l.ReceivedAt <= endDate)
            .OrderByDescending(l => l.ReceivedAt)
            .ToListAsync();
    }
}
