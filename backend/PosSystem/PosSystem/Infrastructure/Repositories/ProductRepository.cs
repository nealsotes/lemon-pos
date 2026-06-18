using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class ProductRepository : IProductRepository
{
    private readonly PosSystemDbContext _context;

    public ProductRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Product>> GetAllAsync()
    {
        return await _context.Products
            .Where(p => p.IsActive)
            .OrderBy(p => p.Category)
            .ThenBy(p => p.Name)
            .ToListAsync();
    }

    // isActive: true = active only, false = inactive only, null = all.
    // The admin "Show inactive" toggle passes false; every other caller passes
    // true (active only), so sales surfaces never list inactive products.
    public async Task<IEnumerable<Product>> GetPaginatedAsync(int page, int pageSize, bool? isActive)
    {
        var query = _context.Products.AsQueryable();
        if (isActive.HasValue)
        {
            query = query.Where(p => p.IsActive == isActive.Value);
        }
        return await query
            .OrderBy(p => p.Category)
            .ThenBy(p => p.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Product?> GetByIdAsync(string id)
    {
        return await GetByIdAsync(id, includeInactive: false);
    }

    // includeInactive lets the update/reactivation path find soft-deleted products.
    // Sales paths (transactions, POS grid) keep the default active-only filter so
    // inactive products can't be sold.
    public async Task<Product?> GetByIdAsync(string id, bool includeInactive)
    {
        var query = _context.Products.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }
        return await query.FirstOrDefaultAsync(p => p.Id == id);
    }

    public async Task<Product> AddAsync(Product product)
    {
        product.CreatedAt = DateTime.UtcNow;
        product.UpdatedAt = DateTime.UtcNow;
        
        _context.Products.Add(product);
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateAsync(Product product)
    {
        product.UpdatedAt = DateTime.UtcNow;
        
        _context.Products.Update(product);
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task DeleteAsync(string id)
    {
        var product = await GetByIdAsync(id);
        if (product != null)
        {
            product.IsActive = false;
            product.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    public async Task DeleteBulkAsync(List<string> ids)
    {
        var products = await _context.Products
            .Where(p => ids.Contains(p.Id) && p.IsActive)
            .ToListAsync();

        foreach (var product in products)
        {
            product.IsActive = false;
            product.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public async Task<IEnumerable<string>> GetCategoriesAsync()
    {
        return await _context.Products
            .Where(p => p.IsActive)
            .Select(p => p.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
    }

    public async Task<IEnumerable<Product>> GetByCategoryAsync(string category)
    {
        return await _context.Products
            .Where(p => p.Category == category && p.IsActive)
            .OrderBy(p => p.Name)
            .ToListAsync();
    }

    public async Task<int> DecrementStockAsync(string productId, int quantity)
    {
        var now = DateTime.UtcNow;
        return await _context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE Products SET Stock = Stock - {quantity}, UpdatedAt = {now} WHERE Id = {productId} AND IsActive = 1 AND Stock >= {quantity}"
        );
    }

    public async Task<int> BulkUpdateAsync(List<string> ids, BulkUpdateFieldsDto updates)
    {
        // Load without IsActive filter — bulk update may reactivate soft-deleted products
        var products = await _context.Products
            .Where(p => ids.Contains(p.Id))
            .ToListAsync();

        foreach (var product in products)
        {
            if (updates.IsActive.HasValue)
            {
                product.IsActive = updates.IsActive.Value;
            }

            if (!string.IsNullOrWhiteSpace(updates.Category))
            {
                product.Category = updates.Category;
            }

            if (updates.Price != null)
            {
                product.Price = updates.Price.Mode == "percent"
                    ? Math.Max(0m, Math.Round(product.Price * (1 + (updates.Price.Value / 100m)), 2))
                    : Math.Max(0m, updates.Price.Value);
            }

            if (updates.Stock != null)
            {
                product.Stock = updates.Stock.Mode == "delta"
                    ? Math.Max(0, product.Stock + updates.Stock.Value)
                    : Math.Max(0, updates.Stock.Value);
            }

            if (updates.AddOns != null)
            {
                product.AddOns = updates.AddOns.Items;
                product.HasAddOns = updates.AddOns.Items.Count > 0;
            }

            product.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return products.Count;
    }
}