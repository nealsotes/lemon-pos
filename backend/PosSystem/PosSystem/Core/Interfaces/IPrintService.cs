using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IPrintService
{
    Task<bool> PrintReceiptAsync(ReceiptData receiptData, bool openDrawer = true);
    Task<bool> OpenCashDrawerAsync(string? printerName = null);
    Task<List<string>> GetAvailablePrintersAsync();
    Task<bool> TestPrintAsync(string? printerName = null);
}

public class ReceiptData
{
    public string ReceiptNumber { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? CustomerEmail { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public ServiceType ServiceType { get; set; } = ServiceType.DineIn;
    public decimal ServiceFee { get; set; } = 0;
    public List<ReceiptItem> Items { get; set; } = new();
    public decimal Subtotal { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }
    public decimal? AmountReceived { get; set; }
    public decimal? Change { get; set; }
    public string? Notes { get; set; }
}

public class ReceiptItem
{
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public decimal Total => Quantity * Price;
    public string? Temperature { get; set; } // "hot", "cold", or null
    public List<ReceiptAddOn>? AddOns { get; set; }
}

public class ReceiptAddOn
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}





