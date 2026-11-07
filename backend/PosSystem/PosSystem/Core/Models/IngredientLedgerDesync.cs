namespace PosSystem.Core.Models;

/// <summary>
/// Read-only diagnostic row for the stock-ledger desync report: an ingredient
/// whose row quantity disagrees with the sum of its active FIFO lots. Operators
/// reconcile these items manually (Adjust Stock or a stock import); nothing
/// mutates legacy data automatically.
/// </summary>
public class IngredientLedgerDesync
{
    public string IngredientId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>Quantity as stored on the ingredient row.</summary>
    public decimal RowQuantity { get; set; }

    /// <summary>Sum of RemainingQuantity over the ingredient's active lots.</summary>
    public decimal LotQuantity { get; set; }
}
