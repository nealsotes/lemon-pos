namespace PosSystem.Core.Models;

public enum ServiceType
{
    DineIn,
    TakeOut
}

public enum Temperature
{
    None,
    Hot,
    Cold
}

public class Transaction
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public List<TransactionItem> Items { get; set; } = new();
    public decimal Total { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public ServiceType ServiceType { get; set; } = ServiceType.DineIn;
    public decimal ServiceFee { get; set; } = 0;
    public CustomerInfo CustomerInfo { get; set; } = new();
    public string Status { get; set; } = "completed";
    public string? Notes { get; set; }
    public decimal AmountReceived { get; set; }
    public decimal Change { get; set; }
}

public class TransactionItem
{
    public string ProductId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty; // Store category for historical data
    public decimal Price { get; set; }
    public decimal BasePrice { get; set; } = 0; // Default to 0 if not provided
    public Temperature Temperature { get; set; } = Temperature.None;
    public int Quantity { get; set; }
    public decimal Total => Price * Quantity;
    public List<AddOn> AddOns { get; set; } = new();
    public DiscountInfo? Discount { get; set; }
}

public class AddOn
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Quantity { get; set; } = 1;
}

public class DiscountInfo
{
    public string Type { get; set; } = string.Empty;
    public decimal Percentage { get; set; }
    public decimal Amount { get; set; }
}

public class CustomerInfo
{
    public string Name { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? DiscountType { get; set; }
    public string? DiscountId { get; set; }
} 