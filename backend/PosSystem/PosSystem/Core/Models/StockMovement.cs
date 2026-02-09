using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public enum MovementType
{
    Purchase,
    Sale,
    Adjustment,
    Waste,
    Return
}

public class StockMovement
{
    public string Id { get; set; } = string.Empty;
    
    [Required]
    public string IngredientId { get; set; } = string.Empty;
    
    [Required]
    public MovementType MovementType { get; set; }
    
    [Required]
    public decimal Quantity { get; set; }
    
    public decimal? UnitCost { get; set; } // Cost per unit at time of movement
    
    [MaxLength(200)]
    public string? Reason { get; set; }
    
    [MaxLength(500)]
    public string? Notes { get; set; }
    
    [MaxLength(100)]
    public string? CreatedBy { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}




