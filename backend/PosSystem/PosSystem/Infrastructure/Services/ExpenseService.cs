using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class ExpenseService : IExpenseService
{
    private readonly IExpenseRepository _expenseRepository;
    private readonly IExpenseCategoryRepository _categoryRepository;

    public ExpenseService(
        IExpenseRepository expenseRepository,
        IExpenseCategoryRepository categoryRepository)
    {
        _expenseRepository = expenseRepository;
        _categoryRepository = categoryRepository;
    }

    // ── Expense CRUD ──

    public async Task<IEnumerable<ExpenseResponseDto>> GetExpensesAsync(DateTime startDate, DateTime endDate, string? categoryId = null)
    {
        var result = new List<ExpenseResponseDto>();

        // 1. One-time expenses in range
        var oneTimeExpenses = await _expenseRepository.GetByDateRangeAsync(startDate, endDate);
        foreach (var expense in oneTimeExpenses)
        {
            if (categoryId != null && expense.CategoryId != categoryId) continue;
            result.Add(MapToResponseDto(expense, isVirtual: false));
        }

        // 2. Recurring templates — generate virtual instances
        var templates = await _expenseRepository.GetRecurringTemplatesAsync();
        foreach (var template in templates)
        {
            if (categoryId != null && template.CategoryId != categoryId) continue;
            if (template.Date > endDate) continue;
            if (template.RecurrenceEndDate.HasValue && template.RecurrenceEndDate.Value < startDate) continue;

            var overrides = await _expenseRepository.GetOverridesForParentAsync(template.Id, startDate, endDate);
            var overrideDates = overrides.Select(o => o.Date.Date).ToHashSet();

            var instances = GenerateRecurringInstances(template, startDate, endDate);
            foreach (var instanceDate in instances)
            {
                if (overrideDates.Contains(instanceDate.Date))
                {
                    // Use the override instead
                    var overrideExpense = overrides.First(o => o.Date.Date == instanceDate.Date);
                    result.Add(MapToResponseDto(overrideExpense, isVirtual: false));
                }
                else
                {
                    result.Add(new ExpenseResponseDto
                    {
                        Id = template.Id,
                        CategoryId = template.CategoryId,
                        CategoryName = template.Category?.Name ?? string.Empty,
                        Description = template.Description,
                        Amount = template.Amount,
                        Date = instanceDate,
                        IsRecurring = true,
                        RecurrenceType = template.RecurrenceType,
                        RecurrenceEndDate = template.RecurrenceEndDate,
                        ParentExpenseId = null,
                        Notes = template.Notes,
                        CreatedBy = template.CreatedBy,
                        CreatedAt = template.CreatedAt,
                        IsVirtual = true
                    });
                }
            }
        }

        return result.OrderByDescending(e => e.Date);
    }

    public async Task<ExpenseResponseDto?> GetExpenseByIdAsync(string id)
    {
        var expense = await _expenseRepository.GetByIdAsync(id);
        if (expense == null) return null;
        return MapToResponseDto(expense, isVirtual: false);
    }

    public async Task<ExpenseResponseDto> CreateExpenseAsync(ExpenseDto dto, string userId)
    {
        var category = await _categoryRepository.GetByIdAsync(dto.CategoryId)
            ?? throw new ArgumentException($"Category with id '{dto.CategoryId}' not found");

        if (dto.IsRecurring && string.IsNullOrEmpty(dto.RecurrenceType))
            throw new InvalidOperationException("RecurrenceType is required for recurring expenses");

        if (dto.RecurrenceEndDate.HasValue && dto.RecurrenceEndDate.Value < dto.Date)
            throw new InvalidOperationException("RecurrenceEndDate must be on or after the expense date");

        var expense = new Expense
        {
            Id = Guid.NewGuid().ToString(),
            CategoryId = dto.CategoryId,
            Description = dto.Description,
            Amount = dto.Amount,
            Date = dto.Date,
            IsRecurring = dto.IsRecurring,
            RecurrenceType = dto.IsRecurring ? dto.RecurrenceType : null,
            RecurrenceEndDate = dto.IsRecurring ? dto.RecurrenceEndDate : null,
            Notes = dto.Notes,
            CreatedBy = userId
        };

        var created = await _expenseRepository.AddAsync(expense);
        created.Category = category;
        return MapToResponseDto(created, isVirtual: false);
    }

    public async Task<ExpenseResponseDto> UpdateExpenseAsync(string id, ExpenseDto dto)
    {
        var expense = await _expenseRepository.GetByIdAsync(id)
            ?? throw new ArgumentException($"Expense with id '{id}' not found");

        var category = await _categoryRepository.GetByIdAsync(dto.CategoryId)
            ?? throw new ArgumentException($"Category with id '{dto.CategoryId}' not found");

        expense.CategoryId = dto.CategoryId;
        expense.Description = dto.Description;
        expense.Amount = dto.Amount;
        expense.Date = dto.Date;
        expense.IsRecurring = dto.IsRecurring;
        expense.RecurrenceType = dto.IsRecurring ? dto.RecurrenceType : null;
        expense.RecurrenceEndDate = dto.IsRecurring ? dto.RecurrenceEndDate : null;
        expense.Notes = dto.Notes;

        var updated = await _expenseRepository.UpdateAsync(expense);
        updated.Category = category;
        return MapToResponseDto(updated, isVirtual: false);
    }

    public async Task DeleteExpenseAsync(string id)
    {
        var expense = await _expenseRepository.GetByIdAsync(id)
            ?? throw new ArgumentException($"Expense with id '{id}' not found");

        // If it's a recurring template, also delete all child overrides
        if (expense.IsRecurring && expense.ParentExpenseId == null)
        {
            await _expenseRepository.DeleteByParentIdAsync(id);
        }

        await _expenseRepository.DeleteAsync(id);
    }

    // ── Reporting helpers ──

    public async Task<decimal> GetTotalExpensesForPeriodAsync(DateTime startDate, DateTime endDate)
    {
        var expenses = await GetMaterializedExpensesAsync(startDate, endDate);
        return expenses.Sum(e => e.Amount);
    }

    public async Task<List<ExpenseCategorySummaryDto>> GetExpensesByCategoryAsync(DateTime startDate, DateTime endDate)
    {
        var expenses = await GetMaterializedExpensesAsync(startDate, endDate);
        return expenses
            .GroupBy(e => e.CategoryName)
            .Select(g => new ExpenseCategorySummaryDto
            {
                CategoryName = g.Key,
                Total = g.Sum(e => e.Amount)
            })
            .OrderByDescending(c => c.Total)
            .ToList();
    }

    /// <summary>
    /// Expenses attributed to ONE breakdown sub-period (one day, or one week of the
    /// weekly grouping).
    ///
    /// Board-adopted basis (roadmap item 2 / reports spec C2·R20·Q8): CASH BASIS.
    /// An expense contributes on the dates its actual occurrences (or overrides) fall,
    /// in the sub-period's window; when no occurrence of a recurring template falls
    /// in the sub-period it contributes NOTHING. The previous implementation also
    /// amortised a share of the template amount into every sub-period without an
    /// occurrence — the P&L statement (cash-basis
    /// <see cref="GetTotalExpensesForPeriodAsync"/>) and this breakdown path then
    /// reported two different expense figures for the same page, and the share's
    /// fractional tail (a divide by the period length computed in floating point)
    /// leaked 4th-decimal pesos onto the report. The window passed here is
    /// <c>[periodStart, periodEnd]</c> inclusive in the caller's instant domain
    /// (ReportingService subtracts the closing tick before calling).
    /// </summary>
    public async Task<decimal> GetProratedExpensesForPeriodAsync(DateTime periodStart, DateTime periodEnd, DateTime rangeStart, DateTime rangeEnd)
    {
        decimal total = 0;

        // 1. One-time expenses that fall within this period
        var oneTimeExpenses = await _expenseRepository.GetByDateRangeAsync(periodStart, periodEnd);
        total += oneTimeExpenses.Sum(e => e.Amount);

        // 2. Recurring expenses: only occurrences (or overrides) dated in this period
        var templates = await _expenseRepository.GetRecurringTemplatesAsync();
        foreach (var template in templates)
        {
            if (template.Date > periodEnd) continue;
            if (template.RecurrenceEndDate.HasValue && template.RecurrenceEndDate.Value < periodStart) continue;

            var instances = GenerateRecurringInstances(template, periodStart, periodEnd);
            if (instances.Count == 0)
            {
                // No occurrence in this sub-period: the template contributes nothing.
                // This is what keeps Σ breakdown rows == statement total by construction
                // (the pinned ProfitLossConsistency suite turns green here).
                continue;
            }

            var overrides = await _expenseRepository.GetOverridesForParentAsync(template.Id, periodStart, periodEnd);
            var overrideDates = overrides.Select(o => o.Date.Date).ToHashSet();

            foreach (var instanceDate in instances)
            {
                total += overrideDates.Contains(instanceDate.Date)
                    ? overrides.First(o => o.Date.Date == instanceDate.Date).Amount
                    : template.Amount;
            }
        }

        return total;
    }

    // ── Category CRUD ──

    public async Task<IEnumerable<ExpenseCategoryResponseDto>> GetCategoriesAsync()
    {
        var categories = await _categoryRepository.GetAllActiveAsync();
        return categories.Select(c => new ExpenseCategoryResponseDto
        {
            Id = c.Id,
            Name = c.Name,
            IsSystem = c.IsSystem,
            SortOrder = c.SortOrder
        });
    }

    public async Task<ExpenseCategoryResponseDto> CreateCategoryAsync(ExpenseCategoryDto dto)
    {
        var allCategories = await _categoryRepository.GetAllActiveAsync();
        var maxSortOrder = allCategories.Any() ? allCategories.Max(c => c.SortOrder) : 0;

        var category = new ExpenseCategory
        {
            Id = Guid.NewGuid().ToString(),
            Name = dto.Name,
            IsSystem = false,
            IsActive = true,
            SortOrder = maxSortOrder + 1
        };

        var created = await _categoryRepository.AddAsync(category);
        return new ExpenseCategoryResponseDto
        {
            Id = created.Id,
            Name = created.Name,
            IsSystem = created.IsSystem,
            SortOrder = created.SortOrder
        };
    }

    public async Task<ExpenseCategoryResponseDto> UpdateCategoryAsync(string id, ExpenseCategoryDto dto)
    {
        var category = await _categoryRepository.GetByIdAsync(id)
            ?? throw new ArgumentException($"Category with id '{id}' not found");

        if (category.IsSystem)
            throw new InvalidOperationException("System categories cannot be renamed");

        category.Name = dto.Name;
        var updated = await _categoryRepository.UpdateAsync(category);
        return new ExpenseCategoryResponseDto
        {
            Id = updated.Id,
            Name = updated.Name,
            IsSystem = updated.IsSystem,
            SortOrder = updated.SortOrder
        };
    }

    public async Task DeleteCategoryAsync(string id)
    {
        var category = await _categoryRepository.GetByIdAsync(id)
            ?? throw new ArgumentException($"Category with id '{id}' not found");

        if (category.IsSystem)
            throw new InvalidOperationException("System categories cannot be deleted");

        await _categoryRepository.DeleteAsync(id);
    }

    // ── Private helpers ──

    private async Task<List<ExpenseResponseDto>> GetMaterializedExpensesAsync(DateTime startDate, DateTime endDate)
    {
        var all = await GetExpensesAsync(startDate, endDate);
        return all.ToList();
    }

    private static List<DateTime> GenerateRecurringInstances(Expense template, DateTime rangeStart, DateTime rangeEnd)
    {
        var instances = new List<DateTime>();
        var current = template.Date;
        var effectiveEnd = template.RecurrenceEndDate.HasValue
            ? (template.RecurrenceEndDate.Value < rangeEnd ? template.RecurrenceEndDate.Value : rangeEnd)
            : rangeEnd;

        while (current <= effectiveEnd)
        {
            if (current >= rangeStart && current <= rangeEnd)
            {
                instances.Add(current);
            }

            current = template.RecurrenceType switch
            {
                "weekly" => current.AddDays(7),
                "monthly" => current.AddMonths(1),
                "yearly" => current.AddYears(1),
                _ => current.AddMonths(1)
            };

            // Safety: prevent infinite loops
            if (instances.Count > 366) break;
        }

        return instances;
    }

    private static ExpenseResponseDto MapToResponseDto(Expense expense, bool isVirtual)
    {
        return new ExpenseResponseDto
        {
            Id = expense.Id,
            CategoryId = expense.CategoryId,
            CategoryName = expense.Category?.Name ?? string.Empty,
            Description = expense.Description,
            Amount = expense.Amount,
            Date = expense.Date,
            IsRecurring = expense.IsRecurring,
            RecurrenceType = expense.RecurrenceType,
            RecurrenceEndDate = expense.RecurrenceEndDate,
            ParentExpenseId = expense.ParentExpenseId,
            Notes = expense.Notes,
            CreatedBy = expense.CreatedBy,
            CreatedAt = expense.CreatedAt,
            IsVirtual = isVirtual
        };
    }
}
