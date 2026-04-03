using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class ExpenseDto
{
    [Required]
    public string CategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Description { get; set; } = string.Empty;

    [Required]
    [Range(0.01, double.MaxValue, ErrorMessage = "Amount must be greater than 0")]
    public decimal Amount { get; set; }

    [Required]
    public DateTime Date { get; set; }

    public bool IsRecurring { get; set; }

    [MaxLength(20)]
    public string? RecurrenceType { get; set; }

    public DateTime? RecurrenceEndDate { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}

public class ExpenseCategoryDto
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
}

public class ExpenseResponseDto
{
    public string Id { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
    public string CategoryName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public DateTime Date { get; set; }
    public bool IsRecurring { get; set; }
    public string? RecurrenceType { get; set; }
    public DateTime? RecurrenceEndDate { get; set; }
    public string? ParentExpenseId { get; set; }
    public string? Notes { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsVirtual { get; set; } // true for generated recurring instances
}

public class ExpenseCategoryResponseDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public int SortOrder { get; set; }
}
