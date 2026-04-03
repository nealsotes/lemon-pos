using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class ExpenseRepository : IExpenseRepository
{
    private readonly PosSystemDbContext _context;

    public ExpenseRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Expense>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        return await _context.Expenses
            .Include(e => e.Category)
            .Where(e => !e.IsRecurring && e.ParentExpenseId == null
                && e.Date >= startDate && e.Date <= endDate)
            .OrderByDescending(e => e.Date)
            .ToListAsync();
    }

    public async Task<IEnumerable<Expense>> GetRecurringTemplatesAsync()
    {
        return await _context.Expenses
            .Include(e => e.Category)
            .Where(e => e.IsRecurring && e.ParentExpenseId == null)
            .OrderBy(e => e.Date)
            .ToListAsync();
    }

    public async Task<IEnumerable<Expense>> GetOverridesForParentAsync(string parentExpenseId, DateTime startDate, DateTime endDate)
    {
        return await _context.Expenses
            .Include(e => e.Category)
            .Where(e => e.ParentExpenseId == parentExpenseId
                && e.Date >= startDate && e.Date <= endDate)
            .ToListAsync();
    }

    public async Task<Expense?> GetByIdAsync(string id)
    {
        return await _context.Expenses
            .Include(e => e.Category)
            .FirstOrDefaultAsync(e => e.Id == id);
    }

    public async Task<Expense> AddAsync(Expense expense)
    {
        expense.CreatedAt = DateTime.UtcNow;
        expense.UpdatedAt = DateTime.UtcNow;

        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync();
        return expense;
    }

    public async Task<Expense> UpdateAsync(Expense expense)
    {
        expense.UpdatedAt = DateTime.UtcNow;

        _context.Expenses.Update(expense);
        await _context.SaveChangesAsync();
        return expense;
    }

    public async Task DeleteAsync(string id)
    {
        var expense = await _context.Expenses.FindAsync(id);
        if (expense != null)
        {
            _context.Expenses.Remove(expense);
            await _context.SaveChangesAsync();
        }
    }

    public async Task DeleteByParentIdAsync(string parentExpenseId)
    {
        var overrides = await _context.Expenses
            .Where(e => e.ParentExpenseId == parentExpenseId)
            .ToListAsync();

        _context.Expenses.RemoveRange(overrides);
        await _context.SaveChangesAsync();
    }
}
