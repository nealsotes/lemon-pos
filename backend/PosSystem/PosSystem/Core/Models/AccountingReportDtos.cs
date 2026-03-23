namespace PosSystem.Core.Models;

// ── Profit & Loss ──

public class ProfitLossReportDto
{
    public decimal GrossRevenue { get; set; }
    public decimal TotalDiscounts { get; set; }
    public decimal NetRevenue { get; set; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal MarginPercent { get; set; }
    public List<ProfitLossPeriodDto> Breakdown { get; set; } = new();
}

public class ProfitLossPeriodDto
{
    public string Period { get; set; } = string.Empty;
    public decimal Revenue { get; set; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal MarginPercent { get; set; }
}

// ── Inventory Valuation ──

public class InventoryValuationReportDto
{
    public decimal TotalValue { get; set; }
    public decimal PeriodChange { get; set; }
    public decimal WasteAndShrinkage { get; set; }
    public int LowStockCount { get; set; }
    public List<IngredientValueDto> TopIngredients { get; set; } = new();
    public List<MovementSummaryDto> MovementSummary { get; set; } = new();
}

public class IngredientValueDto
{
    public string Name { get; set; } = string.Empty;
    public decimal OnHand { get; set; }
    public string Unit { get; set; } = string.Empty;
    public decimal UnitCost { get; set; }
    public decimal TotalValue { get; set; }
    public decimal PercentOfTotal { get; set; }
}

public class MovementSummaryDto
{
    public string Type { get; set; } = string.Empty;
    public int Count { get; set; }
    public decimal TotalCost { get; set; }
}

// ── Accountant Summary ──

public class AccountantSummaryDto
{
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal GrossRevenue { get; set; }
    public decimal TotalDiscounts { get; set; }
    public decimal NetRevenue { get; set; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal GrossMarginPercent { get; set; }
    public int TransactionCount { get; set; }
    public decimal AverageTicket { get; set; }
    public List<PaymentMethodDto> PaymentMethodBreakdown { get; set; } = new();
    public List<CategorySalesDto> CategoryBreakdown { get; set; } = new();
    public decimal CurrentInventoryValue { get; set; }
    public decimal IngredientsConsumed { get; set; }
    public decimal WasteAndShrinkage { get; set; }
}

public class PaymentMethodDto
{
    public string Method { get; set; } = string.Empty;
    public int Count { get; set; }
    public decimal Total { get; set; }
}

public class CategorySalesDto
{
    public string Category { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public decimal Percent { get; set; }
}
