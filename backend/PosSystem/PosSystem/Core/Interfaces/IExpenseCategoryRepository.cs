using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IExpenseCategoryRepository
{
    Task<IEnumerable<ExpenseCategory>> GetAllActiveAsync();
    Task<ExpenseCategory?> GetByIdAsync(string id);
    Task<ExpenseCategory> AddAsync(ExpenseCategory category);
    Task<ExpenseCategory> UpdateAsync(ExpenseCategory category);
    Task DeleteAsync(string id);
}
