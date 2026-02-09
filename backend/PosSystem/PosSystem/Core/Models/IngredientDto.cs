using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class IngredientDto
{
    public string? Id { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    
    [Required]
    public decimal Quantity { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string Unit { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? Supplier { get; set; }
    
    public DateTime? ExpirationDate { get; set; }
    
    [Required]
    public decimal LowStockThreshold { get; set; }
    
    public decimal? UnitCost { get; set; } // Cost per unit
    
    public DateTime? LastPurchaseDate { get; set; } // When last purchased
    
    public decimal? LastPurchaseCost { get; set; } // Cost from last purchase
    
    public bool IsActive { get; set; } = true;
}

