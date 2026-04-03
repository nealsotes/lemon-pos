using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class ExpenseCategoryRepository : IExpenseCategoryRepository
{
    private readonly PosSystemDbContext _context;

    public ExpenseCategoryRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<ExpenseCategory>> GetAllActiveAsync()
    {
        return await _context.ExpenseCategories
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ToListAsync();
    }

    public async Task<ExpenseCategory?> GetByIdAsync(string id)
    {
        return await _context.ExpenseCategories
            .FirstOrDefaultAsync(c => c.Id == id && c.IsActive);
    }

    public async Task<ExpenseCategory> AddAsync(ExpenseCategory category)
    {
        category.CreatedAt = DateTime.UtcNow;

        _context.ExpenseCategories.Add(category);
        await _context.SaveChangesAsync();
        return category;
    }

    public async Task<ExpenseCategory> UpdateAsync(ExpenseCategory category)
    {
        _context.ExpenseCategories.Update(category);
        await _context.SaveChangesAsync();
        return category;
    }

    public async Task DeleteAsync(string id)
    {
        var category = await GetByIdAsync(id);
        if (category != null)
        {
            category.IsActive = false;
            await _context.SaveChangesAsync();
        }
    }
}
