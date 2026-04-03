using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IExpenseRepository
{
    Task<IEnumerable<Expense>> GetByDateRangeAsync(DateTime startDate, DateTime endDate);
    Task<IEnumerable<Expense>> GetRecurringTemplatesAsync();
    Task<IEnumerable<Expense>> GetOverridesForParentAsync(string parentExpenseId, DateTime startDate, DateTime endDate);
    Task<Expense?> GetByIdAsync(string id);
    Task<Expense> AddAsync(Expense expense);
    Task<Expense> UpdateAsync(Expense expense);
    Task DeleteAsync(string id);
    Task DeleteByParentIdAsync(string parentExpenseId);
}
