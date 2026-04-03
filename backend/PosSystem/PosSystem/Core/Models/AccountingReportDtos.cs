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
    public decimal TotalExpenses { get; set; }
    public decimal NetProfit { get; set; }
    public decimal NetMarginPercent { get; set; }
    public List<ExpenseCategorySummaryDto> ExpensesByCategory { get; set; } = new();
    public List<ProfitLossPeriodDto> Breakdown { get; set; } = new();
    public bool CogsWarning { get; set; } // true when COGS=0 but revenue>0
}

public class ProfitLossPeriodDto
{
    public string Period { get; set; } = string.Empty;
    public decimal Revenue { get; set; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal MarginPercent { get; set; }
    public decimal Expenses { get; set; }
    public decimal NetProfit { get; set; }
    public decimal NetMarginPercent { get; set; }
}

public class ExpenseCategorySummaryDto
{
    public string CategoryName { get; set; } = string.Empty;
    public decimal Total { get; set; }
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
    public decimal TotalExpenses { get; set; }
    public decimal NetProfit { get; set; }
    public decimal NetMarginPercent { get; set; }
    public List<ExpenseCategorySummaryDto> ExpensesByCategory { get; set; } = new();
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

// ── Supplier Breakdown ──

public class SupplierBreakdownReportDto
{
    public List<SupplierSummaryDto> SupplierSummary { get; set; } = new();
    public List<IngredientCostComparisonDto> CostComparison { get; set; } = new();
}

public class SupplierSummaryDto
{
    public string Supplier { get; set; } = string.Empty;
    public int PurchaseCount { get; set; }
    public decimal TotalSpent { get; set; }
    public List<string> Ingredients { get; set; } = new();
    public decimal AvgCostPerPurchase { get; set; }
}

public class IngredientCostComparisonDto
{
    public string IngredientName { get; set; } = string.Empty;
    public List<SupplierCostDto> Suppliers { get; set; } = new();
}

public class SupplierCostDto
{
    public string Supplier { get; set; } = string.Empty;
    public decimal UnitCost { get; set; }
    public DateTime LastPurchaseDate { get; set; }
    public decimal QtyPurchased { get; set; }
}

// ── Consumption Report ──

public class ConsumptionReportDto
{
    public decimal TotalConsumedCost { get; set; }
    public string TopIngredientName { get; set; } = string.Empty;
    public int IngredientsUsedCount { get; set; }
    public List<ConsumptionItemDto> Items { get; set; } = new();
}

public class ConsumptionItemDto
{
    public string IngredientName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal QtyUsed { get; set; }
    public decimal CostConsumed { get; set; }
    public decimal PercentOfTotal { get; set; }
    public decimal AvgDaily { get; set; }
}

// ── Period Comparison ──

public class PeriodComparisonDto
{
    public decimal CurrentSales { get; set; }
    public decimal PreviousSales { get; set; }
    public decimal SalesChangePercent { get; set; }
    public int CurrentTransactions { get; set; }
    public int PreviousTransactions { get; set; }
    public decimal TransactionsChangePercent { get; set; }
    public decimal CurrentAvgOrder { get; set; }
    public decimal PreviousAvgOrder { get; set; }
    public decimal AvgOrderChangePercent { get; set; }
}
