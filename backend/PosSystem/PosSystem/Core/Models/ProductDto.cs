using System.Text.Json;

namespace PosSystem.Core.Models;

public class ProductDto
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? HotPrice { get; set; }
    public decimal? ColdPrice { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Stock { get; set; }
    public int LowQuantityThreshold { get; set; } = 10;
    public string Image { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public bool HasHotCold { get; set; } = false;
    public bool HasAddOns { get; set; } = false;
    public List<AddOnDto>? AddOns { get; set; }
}

public class AddOnDto
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}

public class ProductImageDto
{
    public string ImageData { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
}

public class BulkDeleteDto
{
    public List<string> Ids { get; set; } = new();
} 