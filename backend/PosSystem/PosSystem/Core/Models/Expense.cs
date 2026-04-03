using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class Expense
{
    public string Id { get; set; } = string.Empty;

    [Required]
    public string CategoryId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Description { get; set; } = string.Empty;

    [Required]
    public decimal Amount { get; set; }

    [Required]
    public DateTime Date { get; set; }

    public bool IsRecurring { get; set; }

    [MaxLength(20)]
    public string? RecurrenceType { get; set; } // "monthly", "weekly", "yearly"

    public DateTime? RecurrenceEndDate { get; set; }

    public string? ParentExpenseId { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    [Required]
    public string CreatedBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ExpenseCategory? Category { get; set; }
}
