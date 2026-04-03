using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IExpenseService
{
    Task<IEnumerable<ExpenseResponseDto>> GetExpensesAsync(DateTime startDate, DateTime endDate, string? categoryId = null);
    Task<ExpenseResponseDto?> GetExpenseByIdAsync(string id);
    Task<ExpenseResponseDto> CreateExpenseAsync(ExpenseDto dto, string userId);
    Task<ExpenseResponseDto> UpdateExpenseAsync(string id, ExpenseDto dto);
    Task DeleteExpenseAsync(string id);
    Task<decimal> GetTotalExpensesForPeriodAsync(DateTime startDate, DateTime endDate);
    Task<List<ExpenseCategorySummaryDto>> GetExpensesByCategoryAsync(DateTime startDate, DateTime endDate);
    Task<decimal> GetProratedExpensesForPeriodAsync(DateTime periodStart, DateTime periodEnd, DateTime rangeStart, DateTime rangeEnd);

    // Category operations
    Task<IEnumerable<ExpenseCategoryResponseDto>> GetCategoriesAsync();
    Task<ExpenseCategoryResponseDto> CreateCategoryAsync(ExpenseCategoryDto dto);
    Task<ExpenseCategoryResponseDto> UpdateCategoryAsync(string id, ExpenseCategoryDto dto);
    Task DeleteCategoryAsync(string id);
}
