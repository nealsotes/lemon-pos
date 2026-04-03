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

    public async Task<decimal> GetProratedExpensesForPeriodAsync(DateTime periodStart, DateTime periodEnd, DateTime rangeStart, DateTime rangeEnd)
    {
        decimal total = 0;

        // 1. One-time expenses that fall within this period
        var oneTimeExpenses = await _expenseRepository.GetByDateRangeAsync(periodStart, periodEnd);
        total += oneTimeExpenses.Sum(e => e.Amount);

        // 2. Recurring expenses prorated to this period
        var templates = await _expenseRepository.GetRecurringTemplatesAsync();
        foreach (var template in templates)
        {
            if (template.Date > periodEnd) continue;
            if (template.RecurrenceEndDate.HasValue && template.RecurrenceEndDate.Value < periodStart) continue;

            var instances = GenerateRecurringInstances(template, periodStart, periodEnd);
            var instanceCount = instances.Count;

            if (instanceCount > 0)
            {
                // Check for overrides
                var overrides = await _expenseRepository.GetOverridesForParentAsync(template.Id, periodStart, periodEnd);
                var overrideDates = overrides.Select(o => o.Date.Date).ToHashSet();

                foreach (var instanceDate in instances)
                {
                    if (overrideDates.Contains(instanceDate.Date))
                    {
                        var overrideExpense = overrides.First(o => o.Date.Date == instanceDate.Date);
                        total += overrideExpense.Amount;
                    }
                    else
                    {
                        total += template.Amount;
                    }
                }
            }
            else
            {
                // Prorate: if recurring monthly and period is a sub-month range
                total += ProrateRecurringExpense(template, periodStart, periodEnd);
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

    private static decimal ProrateRecurringExpense(Expense template, DateTime periodStart, DateTime periodEnd)
    {
        // For recurring expenses where no full instance falls in the period,
        // prorate based on the fraction of the recurrence period covered
        var periodDays = (periodEnd - periodStart).TotalDays + 1;

        return template.RecurrenceType switch
        {
            "weekly" => template.Amount * (decimal)(periodDays / 7.0),
            "monthly" => template.Amount * (decimal)(periodDays / DateTime.DaysInMonth(periodStart.Year, periodStart.Month)),
            "yearly" => template.Amount * (decimal)(periodDays / 365.0),
            _ => template.Amount * (decimal)(periodDays / 30.0)
        };
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
