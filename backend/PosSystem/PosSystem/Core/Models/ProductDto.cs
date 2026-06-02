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

public class BulkUpdateProductsDto
{
    public List<string> Ids { get; set; } = new();
    public BulkUpdateFieldsDto Updates { get; set; } = new();
}

public class BulkUpdateFieldsDto
{
    public bool? IsActive { get; set; }
    public string? Category { get; set; }
    public PriceUpdateDto? Price { get; set; }
    public StockUpdateDto? Stock { get; set; }
    public AddOnsUpdateDto? AddOns { get; set; }
}

public class PriceUpdateDto
{
    // "set" replaces the price with Value; "percent" applies Value as a percentage delta (+10 = +10%).
    public string Mode { get; set; } = "set";
    public decimal Value { get; set; }
}

public class StockUpdateDto
{
    // "set" replaces stock with Value; "delta" adds Value (can be negative).
    public string Mode { get; set; } = "set";
    public int Value { get; set; }
}

public class AddOnsUpdateDto
{
    public List<AddOnDto> Items { get; set; } = new();
}