using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Services;

public class RecipeService : IRecipeService
{
    private readonly PosSystemDbContext _context;

    public RecipeService(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<RecipeLineDto>> GetRecipeAsync(string productId)
    {
        var productExists = await _context.Products.AnyAsync(p => p.Id == productId && p.IsActive);
        if (!productExists)
            throw new ArgumentException($"Product with ID {productId} not found.");

        var lines = await _context.ProductIngredients
            .Where(pi => pi.ProductId == productId)
            .Join(_context.Ingredients,
                pi => pi.IngredientId,
                i => i.Id,
                (pi, i) => new RecipeLineDto
                {
                    IngredientId = pi.IngredientId,
                    IngredientName = i.Name,
                    QuantityPerUnit = pi.QuantityPerUnit,
                    Unit = i.Unit,
                    SortOrder = pi.SortOrder
                })
            .OrderBy(r => r.SortOrder)
            .ThenBy(r => r.IngredientName)
            .ToListAsync();

        return lines;
    }

    public async Task SetRecipeAsync(string productId, IEnumerable<RecipeLineRequest> lines)
    {
        var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == productId && p.IsActive);
        if (product == null)
            throw new ArgumentException($"Product with ID {productId} not found.");

        var lineList = lines?.ToList() ?? new List<RecipeLineRequest>();
        var ingredientIds = lineList.Select(l => l.IngredientId).Distinct().ToList();

        foreach (var ingredientId in ingredientIds)
        {
            var ingredient = await _context.Ingredients.FirstOrDefaultAsync(i => i.Id == ingredientId && i.IsActive);
            if (ingredient == null)
                throw new ArgumentException($"Ingredient with ID {ingredientId} not found.");
        }

        foreach (var line in lineList)
        {
            if (line.QuantityPerUnit <= 0)
                throw new ArgumentException($"Quantity per unit must be positive for ingredient {line.IngredientId}.");
        }

        var existing = await _context.ProductIngredients
            .Where(pi => pi.ProductId == productId)
            .ToListAsync();
        _context.ProductIngredients.RemoveRange(existing);

        int sortOrder = 0;
        foreach (var line in lineList)
        {
            _context.ProductIngredients.Add(new ProductIngredient
            {
                ProductId = productId,
                IngredientId = line.IngredientId,
                QuantityPerUnit = line.QuantityPerUnit,
                SortOrder = sortOrder++
            });
        }

        await _context.SaveChangesAsync();
    }
}
