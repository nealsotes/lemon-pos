namespace PosSystem.Core.Models;

public class IngredientLotDto
{
    public string? Supplier { get; set; }
    public decimal UnitCost { get; set; }
    public decimal Quantity { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string? LotNumber { get; set; }
    public string? Notes { get; set; }
}

public class IngredientLotUpdateDto
{
    public string? Supplier { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string? LotNumber { get; set; }
    public string? Notes { get; set; }
}
