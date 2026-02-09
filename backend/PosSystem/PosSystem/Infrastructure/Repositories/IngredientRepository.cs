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

    public async Task<IEnumerable<Ingredient>> GetLowStockAsync(decimal threshold)
    {
        return await _context.Ingredients
            .Where(i => i.IsActive && i.Quantity <= i.LowStockThreshold)
            .OrderBy(i => i.Quantity)
            .ToListAsync();
    }
}

