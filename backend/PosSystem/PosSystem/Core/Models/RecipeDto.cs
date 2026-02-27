namespace PosSystem.Core.Models;

/// <summary>One line of a product recipe (for API response).</summary>
public class RecipeLineDto
{
    public string IngredientId { get; set; } = string.Empty;
    public string IngredientName { get; set; } = string.Empty;
    public decimal QuantityPerUnit { get; set; }
    public string Unit { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>Request body for updating a product recipe.</summary>
public class RecipeUpdateRequest
{
    public List<RecipeLineRequest> Lines { get; set; } = new();
}

public class RecipeLineRequest
{
    public string IngredientId { get; set; } = string.Empty;
    public decimal QuantityPerUnit { get; set; }
}
