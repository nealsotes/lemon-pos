namespace PosSystem.Core.Models;

public class InventoryValueReport
{
    public decimal TotalValue { get; set; }
    public int TotalItems { get; set; }
    public IEnumerable<SupplierValue> ValueBySupplier { get; set; } = new List<SupplierValue>();
}

public class SupplierValue
{
    public string? Supplier { get; set; }
    public decimal TotalValue { get; set; }
    public int ItemCount { get; set; }
}




