namespace PosSystem.Core.Models;

public class AdjustQuantityRequestDto
{
    public decimal Adjustment { get; set; }
    public string? MovementType { get; set; }
    public string? Reason { get; set; }
    public string? Notes { get; set; }
    // Lot fields (used when MovementType is Purchase)
    public string? Supplier { get; set; }
    public decimal? UnitCost { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string? LotNumber { get; set; }
}
