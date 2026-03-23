using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace PosSystem.Infrastructure.Services;

public class ReportingService : IReportingService
{
    private readonly PosSystemDbContext _context;

    public ReportingService(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<object> GetDailyReportAsync(DateTime date)
    {
        // Use the input date as-is for start and end of day logic
        // This relies on the frontend passing the correct local date
        var startOfDay = date.Date;
        var endOfDay = startOfDay.AddDays(1);

        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .ToListAsync();

        var totalSales = transactions.Sum(t => t.Total);
        var transactionCount = transactions.Count;
        var averageTransactionValue = transactionCount > 0 ? totalSales / transactionCount : 0;

        // Get top products with product details
        var topProducts = await _context.Transactions
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name, // Use the name stored in transaction items
                Category = g.FirstOrDefault()!.Category, // Use the category stored in transaction items
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(5)
            .ToListAsync();

        // Return data in the format expected by frontend
        return new
        {
            Date = date.Date,
            TotalSales = totalSales,
            TransactionCount = transactionCount,
            AverageTransactionValue = averageTransactionValue,
            TopProducts = topProducts
        };
    }

    public async Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate)
    {
        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .ToListAsync();

        var dailySales = transactions
            .GroupBy(t => t.Timestamp.Date)
            .Select(g => new
            {
                Date = g.Key,
                TotalSales = g.Sum(t => t.Total),
                TransactionCount = g.Count()
            })
            .OrderBy(x => x.Date)
            .ToList();

        return new
        {
            StartDate = startDate.Date,
            EndDate = endDate.Date,
            TotalSales = transactions.Sum(t => t.Total),
            TotalTransactions = transactions.Count,
            DailySales = dailySales
        };
    }

    public async Task<object> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10)
    {
        var topProducts = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name, // Use the name stored in transaction items
                Category = g.FirstOrDefault()!.Category, // Use the category stored in transaction items
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(count)
            .ToListAsync();

        return topProducts;
    }

    public async Task<object> GetCategoryReportAsync(DateTime startDate, DateTime endDate)
    {
        var categorySales = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .SelectMany(t => t.Items)
            .Join(_context.Products,
                item => item.ProductId,
                product => product.Id,
                (item, product) => new { item, product })
            .GroupBy(x => x.product.Category)
            .Select(g => new
            {
                Category = g.Key,
                Quantity = g.Sum(x => x.item.Quantity),
                Revenue = g.Sum(x => x.item.Price * x.item.Quantity)
            })
            .OrderByDescending(x => x.Revenue)
            .ToListAsync();

        return categorySales;
    }

    public async Task<object> GetAllTimeProductSalesAsync()
    {
        // Get all products with their total sold quantity (all-time)
        var products = await _context.Products
            .Where(p => p.IsActive)
            .ToListAsync();

        var productSales = await _context.Transactions
            .SelectMany(t => t.Items.Select(item => new { item, t.Timestamp }))
            .GroupBy(x => x.item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                TotalSold = g.Sum(x => x.item.Quantity),
                TotalRevenue = g.Sum(x => x.item.Price * x.item.Quantity),
                LastSoldDate = g.Max(x => x.Timestamp)
            })
            .ToListAsync();

        // Join products with their sales data
        var result = products.Select(p =>
        {
            var sales = productSales.FirstOrDefault(s => s.ProductId == p.Id);
            return new
            {
                ProductId = p.Id,
                Name = p.Name,
                Category = p.Category,
                Price = p.Price,
                Stock = p.Stock,
                Image = p.Image,
                TotalSold = sales?.TotalSold ?? 0,
                TotalRevenue = sales?.TotalRevenue ?? 0,
                LastSoldDate = sales?.LastSoldDate
            };
        })
        .OrderByDescending(p => p.TotalSold)
        .ToList();

        return result;
    }

    // ── COGS helper ──

    private async Task<Dictionary<string, decimal>> GetCogsByProductIdAsync()
    {
        var recipes = await _context.Set<ProductIngredient>()
            .Include(pi => pi.Ingredient)
            .Where(pi => pi.Ingredient != null)
            .ToListAsync();

        return recipes
            .GroupBy(pi => pi.ProductId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(pi => pi.QuantityPerUnit * (pi.Ingredient!.UnitCost ?? 0))
            );
    }

    private decimal CalculateCogsForItems(
        IEnumerable<TransactionItem> items,
        Dictionary<string, decimal> cogsByProduct)
    {
        return items.Sum(item =>
        {
            cogsByProduct.TryGetValue(item.ProductId, out var costPerUnit);
            return costPerUnit * item.Quantity;
        });
    }

    // ── Profit & Loss ──

    public async Task<ProfitLossReportDto> GetProfitLossReportAsync(DateTime startDate, DateTime endDate)
    {
        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate && t.Status == "completed")
            .ToListAsync();

        var allItems = transactions.SelectMany(t => t.Items).ToList();
        var cogsByProduct = await GetCogsByProductIdAsync();

        var grossRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount * i.Quantity);
        var netRevenue = grossRevenue;
        var totalCogs = CalculateCogsForItems(allItems, cogsByProduct);
        var grossProfit = netRevenue - totalCogs;
        var marginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

        // Group by day for breakdown
        var daySpan = (endDate - startDate).TotalDays;
        List<ProfitLossPeriodDto> breakdown;

        if (daySpan > 60)
        {
            // Weekly grouping
            breakdown = transactions
                .GroupBy(t =>
                {
                    var diff = (t.Timestamp.Date - startDate.Date).Days;
                    var weekNum = diff / 7;
                    return startDate.Date.AddDays(weekNum * 7);
                })
                .OrderBy(g => g.Key)
                .Select(g =>
                {
                    var items = g.SelectMany(t => t.Items).ToList();
                    var rev = g.Sum(t => t.Total);
                    var cogs = CalculateCogsForItems(items, cogsByProduct);
                    var profit = rev - cogs;
                    return new ProfitLossPeriodDto
                    {
                        Period = $"{g.Key:MMM dd} – {g.Key.AddDays(6):MMM dd}",
                        Revenue = rev,
                        Cogs = cogs,
                        GrossProfit = profit,
                        MarginPercent = rev > 0 ? (profit / rev) * 100 : 0
                    };
                })
                .ToList();
        }
        else
        {
            // Daily grouping
            breakdown = transactions
                .GroupBy(t => t.Timestamp.Date)
                .OrderBy(g => g.Key)
                .Select(g =>
                {
                    var items = g.SelectMany(t => t.Items).ToList();
                    var rev = g.Sum(t => t.Total);
                    var cogs = CalculateCogsForItems(items, cogsByProduct);
                    var profit = rev - cogs;
                    return new ProfitLossPeriodDto
                    {
                        Period = g.Key.ToString("MMM dd"),
                        Revenue = rev,
                        Cogs = cogs,
                        GrossProfit = profit,
                        MarginPercent = rev > 0 ? (profit / rev) * 100 : 0
                    };
                })
                .ToList();
        }

        return new ProfitLossReportDto
        {
            GrossRevenue = grossRevenue,
            TotalDiscounts = totalDiscounts,
            NetRevenue = netRevenue,
            Cogs = totalCogs,
            GrossProfit = grossProfit,
            MarginPercent = marginPercent,
            Breakdown = breakdown
        };
    }

    // ── Inventory Valuation ──

    public async Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate)
    {
        var ingredients = await _context.Ingredients
            .Where(i => i.IsActive)
            .ToListAsync();

        var totalValue = ingredients.Sum(i => (i.UnitCost ?? 0) * i.Quantity);
        var lowStockCount = ingredients.Count(i => i.Quantity <= i.LowStockThreshold);

        // Stock movements in period
        var movements = await _context.StockMovements
            .Where(m => m.CreatedAt >= startDate && m.CreatedAt <= endDate)
            .ToListAsync();

        // Period change: purchases/returns add value, sales/waste/adjustments subtract
        var periodChange = movements.Sum(m =>
        {
            var cost = Math.Abs(m.Quantity) * (m.UnitCost ?? 0);
            return m.MovementType switch
            {
                MovementType.Purchase or MovementType.Return => cost,
                MovementType.Sale or MovementType.Waste => -cost,
                MovementType.Adjustment => m.Quantity >= 0 ? cost : -cost,
                _ => 0
            };
        });

        var wasteAndShrinkage = movements
            .Where(m => m.MovementType == MovementType.Waste ||
                        (m.MovementType == MovementType.Adjustment && m.Quantity < 0))
            .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));

        // Top ingredients by value
        var topIngredients = ingredients
            .OrderByDescending(i => (i.UnitCost ?? 0) * i.Quantity)
            .Take(10)
            .Select(i => new IngredientValueDto
            {
                Name = i.Name,
                OnHand = i.Quantity,
                Unit = i.Unit,
                UnitCost = i.UnitCost ?? 0,
                TotalValue = (i.UnitCost ?? 0) * i.Quantity,
                PercentOfTotal = totalValue > 0
                    ? ((i.UnitCost ?? 0) * i.Quantity / totalValue) * 100
                    : 0
            })
            .ToList();

        // Movement summary by type
        var movementSummary = movements
            .GroupBy(m => m.MovementType)
            .Select(g => new MovementSummaryDto
            {
                Type = g.Key.ToString(),
                Count = g.Count(),
                TotalCost = g.Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0))
            })
            .OrderByDescending(m => m.TotalCost)
            .ToList();

        return new InventoryValuationReportDto
        {
            TotalValue = totalValue,
            PeriodChange = periodChange,
            WasteAndShrinkage = wasteAndShrinkage,
            LowStockCount = lowStockCount,
            TopIngredients = topIngredients,
            MovementSummary = movementSummary
        };
    }

    // ── Accountant Summary ──

    public async Task<AccountantSummaryDto> GetAccountantSummaryAsync(DateTime startDate, DateTime endDate)
    {
        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate && t.Status == "completed")
            .ToListAsync();

        var allItems = transactions.SelectMany(t => t.Items).ToList();
        var cogsByProduct = await GetCogsByProductIdAsync();

        var grossRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount * i.Quantity);
        var netRevenue = grossRevenue;
        var totalCogs = CalculateCogsForItems(allItems, cogsByProduct);
        var grossProfit = netRevenue - totalCogs;
        var transactionCount = transactions.Count;
        var averageTicket = transactionCount > 0 ? grossRevenue / transactionCount : 0;

        // Payment method breakdown
        var paymentBreakdown = transactions
            .GroupBy(t => t.PaymentMethod)
            .Select(g => new PaymentMethodDto
            {
                Method = g.Key,
                Count = g.Count(),
                Total = g.Sum(t => t.Total)
            })
            .OrderByDescending(p => p.Total)
            .ToList();

        // Category breakdown
        var categoryTotal = allItems.Sum(i => i.Price * i.Quantity);
        var categoryBreakdown = allItems
            .GroupBy(i => i.Category)
            .Select(g =>
            {
                var total = g.Sum(i => i.Price * i.Quantity);
                return new CategorySalesDto
                {
                    Category = g.Key,
                    Total = total,
                    Percent = categoryTotal > 0 ? (total / categoryTotal) * 100 : 0
                };
            })
            .OrderByDescending(c => c.Total)
            .ToList();

        // Inventory snapshot
        var ingredients = await _context.Ingredients
            .Where(i => i.IsActive)
            .ToListAsync();
        var currentInventoryValue = ingredients.Sum(i => (i.UnitCost ?? 0) * i.Quantity);

        var movements = await _context.StockMovements
            .Where(m => m.CreatedAt >= startDate && m.CreatedAt <= endDate)
            .ToListAsync();

        var ingredientsConsumed = movements
            .Where(m => m.MovementType == MovementType.Sale)
            .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));

        var wasteAndShrinkage = movements
            .Where(m => m.MovementType == MovementType.Waste ||
                        (m.MovementType == MovementType.Adjustment && m.Quantity < 0))
            .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));

        return new AccountantSummaryDto
        {
            StartDate = startDate,
            EndDate = endDate,
            GrossRevenue = grossRevenue,
            TotalDiscounts = totalDiscounts,
            NetRevenue = netRevenue,
            Cogs = totalCogs,
            GrossProfit = grossProfit,
            GrossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
            TransactionCount = transactionCount,
            AverageTicket = averageTicket,
            PaymentMethodBreakdown = paymentBreakdown,
            CategoryBreakdown = categoryBreakdown,
            CurrentInventoryValue = currentInventoryValue,
            IngredientsConsumed = ingredientsConsumed,
            WasteAndShrinkage = wasteAndShrinkage
        };
    }
}