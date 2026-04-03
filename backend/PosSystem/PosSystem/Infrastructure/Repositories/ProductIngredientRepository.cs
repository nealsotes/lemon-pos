using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class ProductIngredientRepository : IProductIngredientRepository
{
    private readonly PosSystemDbContext _context;

    public ProductIngredientRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<ProductIngredient>> GetByProductIdAsync(string productId)
    {
        return await _context.ProductIngredients
            .Where(pi => pi.ProductId == productId)
            .ToListAsync();
    }

    public async Task<IEnumerable<ProductIngredient>> GetAllWithIngredientsAsync()
    {
        return await _context.ProductIngredients
            .Include(pi => pi.Ingredient)
            .Where(pi => pi.Ingredient != null)
            .ToListAsync();
    }
}
