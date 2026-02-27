using System.ComponentModel.DataAnnotations;

namespace PosSystem.Core.Models;

public class ProductIngredient
{
    public string ProductId { get; set; } = string.Empty;
    public string IngredientId { get; set; } = string.Empty;

    /// <summary>Quantity of ingredient required per one unit of product.</summary>
    [Required]
    public decimal QuantityPerUnit { get; set; }

    /// <summary>Optional display order for recipe lines.</summary>
    public int SortOrder { get; set; }

    // Navigation (optional, for eager loading)
    public virtual Product? Product { get; set; }
    public virtual Ingredient? Ingredient { get; set; }
}
