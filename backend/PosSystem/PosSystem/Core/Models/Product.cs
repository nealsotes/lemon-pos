namespace PosSystem.Core.Models;

public class Product
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? HotPrice { get; set; }
    public decimal? ColdPrice { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Stock { get; set; }
    public int LowQuantityThreshold { get; set; } = 10; // Default threshold
    public string Image { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
} 