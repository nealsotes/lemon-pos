namespace PosSystem.Core.Models;

// Typed rows for the IReportingService reports ExportService consumes (OT-02).
// Property names intentionally match the previous anonymous-type shapes (the
// methods used to return Task<object>) so the JSON wire contract of the
// /api/reports and /api/products/best-sellers endpoints is unchanged.
// (CategorySalesDto — Total/Percent rows inside AccountantSummary — is an
// unrelated, pre-existing shape kept untouched.)
public class TopSellingProductDto
{
    public string ProductId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Revenue { get; set; }
}

// The raw per-category rows of the category report — same shape the reports
// page consumes ({category, quantity, revenue}).
public class CategoryRevenueDto
{
    public string Category { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Revenue { get; set; }
}