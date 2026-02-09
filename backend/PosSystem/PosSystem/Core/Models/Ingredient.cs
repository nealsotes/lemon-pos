using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class Ingredient
{
    public string Id { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [Required]
    public decimal Quantity { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string Unit { get; set; } = string.Empty; // kg, g, L, pieces
    
    [MaxLength(100)]
    public string? Supplier { get; set; }
    
    public DateTime? ExpirationDate { get; set; }
    
    [Required]
    public decimal LowStockThreshold { get; set; }
    
    public decimal? UnitCost { get; set; } // Cost per unit
    
    public DateTime? LastPurchaseDate { get; set; } // When last purchased
    
    public decimal? LastPurchaseCost { get; set; } // Cost from last purchase
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public bool IsActive { get; set; } = true;
    
    // Computed property for total cost
    public decimal TotalCost => (UnitCost ?? 0) * Quantity;
}

