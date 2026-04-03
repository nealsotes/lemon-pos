using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class IngredientLot
{
    public string Id { get; set; } = string.Empty;

    [Required]
    public string IngredientId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Supplier { get; set; }

    [Required]
    public decimal UnitCost { get; set; }

    [Required]
    public decimal InitialQuantity { get; set; }

    [Required]
    public decimal RemainingQuantity { get; set; }

    public DateTime? ExpirationDate { get; set; }

    [Required]
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string? LotNumber { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public bool IsActive { get; set; } = true;
}
