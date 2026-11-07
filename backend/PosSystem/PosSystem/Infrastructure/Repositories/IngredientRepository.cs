using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class IngredientRepository : IIngredientRepository
{
    private readonly PosSystemDbContext _context;

    public IngredientRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Ingredient>> GetAllAsync()
    {
        return await _context.Ingredients
            .Where(i => i.IsActive)
            .OrderBy(i => i.Name)
            .ToListAsync();
    }

    public async Task<Ingredient?> GetByIdAsync(string id)
    {
        return await _context.Ingredients
            .FirstOrDefaultAsync(i => i.Id == id && i.IsActive);
    }

    public async Task<Ingredient> AddAsync(Ingredient ingredient)
    {
        ingredient.CreatedAt = DateTime.UtcNow;
        ingredient.UpdatedAt = DateTime.UtcNow;
        
        _context.Ingredients.Add(ingredient);
        await _context.SaveChangesAsync();
        return ingredient;
    }

    public async Task<Ingredient> UpdateAsync(Ingredient ingredient)
    {
        ingredient.UpdatedAt = DateTime.UtcNow;
        
        _context.Ingredients.Update(ingredient);
        await _context.SaveChangesAsync();
        return ingredient;
    }

    public async Task DeleteAsync(string id)
    {
        var ingredient = await GetByIdAsync(id);
        if (ingredient != null)
        {
            ingredient.IsActive = false;
            ingredient.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    // Soft-delete only ACTIVE ingredients that exist; already-inactive and
    // unknown ids neither count nor change their rows. One SaveChanges for the batch.
    public async Task<int> DeleteBulkAsync(IEnumerable<string> ids)
    {
        var requested = ids?.Distinct().ToList() ?? new List<string>();
        if (requested.Count == 0)
        {
            return 0;
        }

        var targets = await _context.Ingredients
            .Where(i => i.IsActive && requested.Contains(i.Id))
            .ToListAsync();
        var utcNow = DateTime.UtcNow;
        foreach (var ingredient in targets)
        {
            ingredient.IsActive = false;
            ingredient.UpdatedAt = utcNow;
        }
        if (targets.Count > 0)
        {
            await _context.SaveChangesAsync();
        }
        return targets.Count;
    }

    // Each ingredient carries its own LowStockThreshold, so low-stock is a per-item comparison.
    public async Task<IEnumerable<Ingredient>> GetLowStockAsync()
    {
        return await _context.Ingredients
            .Where(i => i.IsActive && i.Quantity <= i.LowStockThreshold)
            .OrderBy(i => i.Quantity)
            .ToListAsync();
    }

    public async Task<IEnumerable<Ingredient>> GetAllIncludingInactiveAsync()
    {
        return await _context.Ingredients
            .OrderBy(i => i.Name)
            .ToListAsync();
    }

    public async Task<IEnumerable<IngredientLedgerDesync>> GetLedgerDesyncsAsync()
    {
        // Read-only diagnostic for the stock-ledger desync fix: report active items
        // whose row quantity disagrees with the sum of their active FIFO lots.
        // Deliberately in-memory LINQ (item counts are small; InMemory and MySQL
        // get identical semantics). Nothing here mutates legacy data - the operator
        // reconciles flagged items via Adjust Stock or a stock import.
        var ingredients = await _context.Ingredients
            .Where(i => i.IsActive)
            .ToListAsync();
        var lotTotals = await _context.IngredientLots
            .Where(l => l.IsActive && l.RemainingQuantity > 0)
            .GroupBy(l => l.IngredientId)
            .Select(g => new { IngredientId = g.Key, Total = g.Sum(l => l.RemainingQuantity) })
            .ToDictionaryAsync(x => x.IngredientId, x => x.Total);

        var desyncs = new List<IngredientLedgerDesync>();
        foreach (var ingredient in ingredients)
        {
            lotTotals.TryGetValue(ingredient.Id, out var lotTotal);
            if (ingredient.Quantity != lotTotal)
            {
                desyncs.Add(new IngredientLedgerDesync
                {
                    IngredientId = ingredient.Id,
                    Name = ingredient.Name,
                    RowQuantity = ingredient.Quantity,
                    LotQuantity = lotTotal
                });
            }
        }

        return desyncs;
    }
}

