using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class ReportingService : IReportingService
{
    private readonly ITransactionRepository _transactionRepository;
    private readonly IProductRepository _productRepository;
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IStockMovementRepository _stockMovementRepository;
    private readonly IIngredientLotRepository _ingredientLotRepository;
    private readonly IProductIngredientRepository _productIngredientRepository;
    private readonly IExpenseService _expenseService;

    public ReportingService(
        ITransactionRepository transactionRepository,
        IProductRepository productRepository,
        IIngredientRepository ingredientRepository,
        IStockMovementRepository stockMovementRepository,
        IIngredientLotRepository ingredientLotRepository,
        IProductIngredientRepository productIngredientRepository,
        IExpenseService expenseService)
    {
        _transactionRepository = transactionRepository;
        _productRepository = productRepository;
        _ingredientRepository = ingredientRepository;
        _stockMovementRepository = stockMovementRepository;
        _ingredientLotRepository = ingredientLotRepository;
        _productIngredientRepository = productIngredientRepository;
        _expenseService = expenseService;
    }

    public async Task<object> GetDailyReportAsync(DateTime date)
    {
        var startOfDay = date.Date;
        var endOfDay = startOfDay.AddDays(1).AddSeconds(-1);

        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startOfDay, endOfDay);
        var transactions = allTransactions.ToList();

        var totalSales = transactions.Sum(t => t.Total);
        var transactionCount = transactions.Count;
        var averageTransactionValue = transactionCount > 0 ? totalSales / transactionCount : 0;

        // Get top products from transaction items
        var topProducts = transactions
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name,
                Category = g.FirstOrDefault()!.Category,
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(5)
            .ToList();

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
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var transactions = allTransactions.ToList();

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
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);

        var topProducts = allTransactions
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name,
                Category = g.FirstOrDefault()!.Category,
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(count)
            .ToList();

        return topProducts;
    }

    public async Task<object> GetCategoryReportAsync(DateTime startDate, DateTime endDate)
    {
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var products = (await _productRepository.GetAllAsync()).ToDictionary(p => p.Id);

        var categorySales = allTransactions
            .SelectMany(t => t.Items)
            .Where(item => products.ContainsKey(item.ProductId))
            .GroupBy(item => products[item.ProductId].Category)
            .Select(g => new
            {
                Category = g.Key,
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(x => x.Revenue)
            .ToList();

        return categorySales;
    }

    public async Task<object> GetAllTimeProductSalesAsync()
    {
        var products = (await _productRepository.GetAllAsync()).ToList();
        var allTransactions = await _transactionRepository.GetAllAsync();

        var productSales = allTransactions
            .SelectMany(t => t.Items.Select(item => new { item, t.Timestamp }))
            .GroupBy(x => x.item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                TotalSold = g.Sum(x => x.item.Quantity),
                TotalRevenue = g.Sum(x => x.item.Price * x.item.Quantity),
                LastSoldDate = g.Max(x => x.Timestamp)
            })
            .ToList();

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
        var recipes = (await _productIngredientRepository.GetAllWithIngredientsAsync()).ToList();

        // Build FIFO cost map: oldest active lot cost per ingredient, fallback to most recent lot
        var ingredientFifoCosts = new Dictionary<string, decimal>();
        var ingredientIds = recipes.Select(r => r.IngredientId).Distinct();
        foreach (var ingredientId in ingredientIds)
        {
            var oldestActive = await _ingredientLotRepository.GetOldestActiveLotAsync(ingredientId);
            if (oldestActive != null)
            {
                ingredientFifoCosts[ingredientId] = oldestActive.UnitCost;
                continue;
            }

            var mostRecent = await _ingredientLotRepository.GetMostRecentLotAsync(ingredientId);
            if (mostRecent != null)
            {
                ingredientFifoCosts[ingredientId] = mostRecent.UnitCost;
            }
            else
            {
                // No lots at all — fall back to ingredient's weighted average
                var ingredient = recipes.FirstOrDefault(r => r.IngredientId == ingredientId)?.Ingredient;
                ingredientFifoCosts[ingredientId] = ingredient?.UnitCost ?? 0;
            }
        }

        return recipes
            .GroupBy(pi => pi.ProductId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(pi =>
                {
                    ingredientFifoCosts.TryGetValue(pi.IngredientId, out var fifoCost);
                    return pi.QuantityPerUnit * fifoCost;
                })
            );
    }

    private async Task<decimal> CalculateTotalCogsFromMovementsAsync(DateTime startDate, DateTime endDate)
    {
        var movements = await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate);
        return movements
            .Where(m => m.MovementType == MovementType.Sale)
            .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));
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
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var transactions = allTransactions.Where(t => t.Status == "completed").ToList();

        var allItems = transactions.SelectMany(t => t.Items).ToList();

        var grossRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount * i.Quantity);

        // Fix 1: Properly subtract discounts from net revenue
        var netRevenue = grossRevenue - totalDiscounts;

        // Use movement-based COGS for totals
        var totalCogs = await CalculateTotalCogsFromMovementsAsync(startDate, endDate);

        // Fix 2: If no movement COGS but revenue exists, fall back to recipe-based
        var cogsByProduct = await GetCogsByProductIdAsync();
        var cogsWarning = false;
        if (totalCogs == 0 && grossRevenue > 0)
        {
            var recipeCogs = CalculateCogsForItems(allItems, cogsByProduct);
            if (recipeCogs > 0)
            {
                totalCogs = recipeCogs;
            }
            else
            {
                // Fix 3: Flag when COGS is genuinely zero with revenue
                cogsWarning = true;
            }
        }

        var grossProfit = netRevenue - totalCogs;
        var marginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

        // Expenses integration
        var totalExpenses = await _expenseService.GetTotalExpensesForPeriodAsync(startDate, endDate);
        var expensesByCategory = await _expenseService.GetExpensesByCategoryAsync(startDate, endDate);
        var netProfit = grossProfit - totalExpenses;
        var netMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

        // All sale movements for period breakdown (Fix 2: use movements for breakdown too)
        var allMovements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate))
            .Where(m => m.MovementType == MovementType.Sale)
            .ToList();

        // Group by day for breakdown
        var daySpan = (endDate - startDate).TotalDays;
        List<ProfitLossPeriodDto> breakdown;

        if (daySpan > 60)
        {
            // Weekly grouping
            var weekGroups = transactions
                .GroupBy(t =>
                {
                    var diff = (t.Timestamp.Date - startDate.Date).Days;
                    var weekNum = diff / 7;
                    return startDate.Date.AddDays(weekNum * 7);
                })
                .OrderBy(g => g.Key)
                .ToList();

            breakdown = new List<ProfitLossPeriodDto>();
            foreach (var g in weekGroups)
            {
                var periodStart = g.Key;
                var periodEnd = g.Key.AddDays(6);
                if (periodEnd > endDate) periodEnd = endDate;

                var rev = g.Sum(t => t.Total);
                var periodCogs = allMovements
                    .Where(m => m.CreatedAt >= periodStart && m.CreatedAt <= periodEnd.AddDays(1).AddTicks(-1))
                    .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));
                if (periodCogs == 0 && rev > 0)
                {
                    var items = g.SelectMany(t => t.Items).ToList();
                    periodCogs = CalculateCogsForItems(items, cogsByProduct);
                }
                var profit = rev - periodCogs;
                var expenses = await _expenseService.GetProratedExpensesForPeriodAsync(periodStart, periodEnd, startDate, endDate);
                var periodNetProfit = profit - expenses;
                breakdown.Add(new ProfitLossPeriodDto
                {
                    Period = $"{periodStart:MMM dd} – {periodEnd:MMM dd}",
                    Revenue = rev,
                    Cogs = periodCogs,
                    GrossProfit = profit,
                    MarginPercent = rev > 0 ? (profit / rev) * 100 : 0,
                    Expenses = expenses,
                    NetProfit = periodNetProfit,
                    NetMarginPercent = rev > 0 ? (periodNetProfit / rev) * 100 : 0
                });
            }
        }
        else
        {
            // Daily grouping
            var dayGroups = transactions
                .GroupBy(t => t.Timestamp.Date)
                .OrderBy(g => g.Key)
                .ToList();

            breakdown = new List<ProfitLossPeriodDto>();
            foreach (var g in dayGroups)
            {
                var dayStart = g.Key;
                var dayEnd = g.Key.AddDays(1).AddTicks(-1);

                var rev = g.Sum(t => t.Total);
                var periodCogs = allMovements
                    .Where(m => m.CreatedAt >= dayStart && m.CreatedAt <= dayEnd)
                    .Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));
                if (periodCogs == 0 && rev > 0)
                {
                    var items = g.SelectMany(t => t.Items).ToList();
                    periodCogs = CalculateCogsForItems(items, cogsByProduct);
                }
                var profit = rev - periodCogs;
                var expenses = await _expenseService.GetProratedExpensesForPeriodAsync(dayStart, dayEnd, startDate, endDate);
                var periodNetProfit = profit - expenses;
                breakdown.Add(new ProfitLossPeriodDto
                {
                    Period = dayStart.ToString("MMM dd"),
                    Revenue = rev,
                    Cogs = periodCogs,
                    GrossProfit = profit,
                    MarginPercent = rev > 0 ? (profit / rev) * 100 : 0,
                    Expenses = expenses,
                    NetProfit = periodNetProfit,
                    NetMarginPercent = rev > 0 ? (periodNetProfit / rev) * 100 : 0
                });
            }
        }

        return new ProfitLossReportDto
        {
            GrossRevenue = grossRevenue,
            TotalDiscounts = totalDiscounts,
            NetRevenue = netRevenue,
            Cogs = totalCogs,
            GrossProfit = grossProfit,
            MarginPercent = marginPercent,
            TotalExpenses = totalExpenses,
            NetProfit = netProfit,
            NetMarginPercent = netMarginPercent,
            ExpensesByCategory = expensesByCategory,
            Breakdown = breakdown,
            CogsWarning = cogsWarning
        };
    }

    // ── Inventory Valuation ──

    public async Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate)
    {
        var ingredients = (await _ingredientRepository.GetAllAsync()).ToList();

        var totalValue = ingredients.Sum(i => (i.UnitCost ?? 0) * i.Quantity);
        var lowStockCount = ingredients.Count(i => i.Quantity <= i.LowStockThreshold);

        // Stock movements in period
        var movements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate)).ToList();

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
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var transactions = allTransactions.Where(t => t.Status == "completed").ToList();

        var allItems = transactions.SelectMany(t => t.Items).ToList();
        var cogsByProduct = await GetCogsByProductIdAsync();

        var grossRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount * i.Quantity);
        // Fix 1: Properly subtract discounts
        var netRevenue = grossRevenue - totalDiscounts;
        var totalCogs = await CalculateTotalCogsFromMovementsAsync(startDate, endDate);
        var grossProfit = netRevenue - totalCogs;
        var transactionCount = transactions.Count;
        var averageTicket = transactionCount > 0 ? grossRevenue / transactionCount : 0;

        // Expenses integration
        var totalExpenses = await _expenseService.GetTotalExpensesForPeriodAsync(startDate, endDate);
        var expensesByCategory = await _expenseService.GetExpensesByCategoryAsync(startDate, endDate);
        var netProfit = grossProfit - totalExpenses;
        var netMarginPercent = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

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
        var ingredients = (await _ingredientRepository.GetAllAsync()).ToList();
        var currentInventoryValue = ingredients.Sum(i => (i.UnitCost ?? 0) * i.Quantity);

        var movements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate)).ToList();

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
            TotalExpenses = totalExpenses,
            NetProfit = netProfit,
            NetMarginPercent = netMarginPercent,
            ExpensesByCategory = expensesByCategory,
            TransactionCount = transactionCount,
            AverageTicket = averageTicket,
            PaymentMethodBreakdown = paymentBreakdown,
            CategoryBreakdown = categoryBreakdown,
            CurrentInventoryValue = currentInventoryValue,
            IngredientsConsumed = ingredientsConsumed,
            WasteAndShrinkage = wasteAndShrinkage
        };
    }

    public async Task<SupplierBreakdownReportDto> GetSupplierBreakdownAsync(DateTime startDate, DateTime endDate)
    {
        var lots = (await _ingredientLotRepository.GetByDateRangeAsync(startDate, endDate)).ToList();

        var ingredients = (await _ingredientRepository.GetAllAsync())
            .ToDictionary(i => i.Id, i => i.Name);

        // Supplier summary
        var supplierGroups = lots
            .Where(l => !string.IsNullOrEmpty(l.Supplier))
            .GroupBy(l => l.Supplier!)
            .Select(g => new SupplierSummaryDto
            {
                Supplier = g.Key,
                PurchaseCount = g.Count(),
                TotalSpent = g.Sum(l => l.InitialQuantity * l.UnitCost),
                Ingredients = g
                    .Select(l => ingredients.GetValueOrDefault(l.IngredientId, "Unknown"))
                    .Distinct()
                    .ToList(),
                AvgCostPerPurchase = g.Count() > 0
                    ? g.Sum(l => l.InitialQuantity * l.UnitCost) / g.Count()
                    : 0
            })
            .OrderByDescending(s => s.TotalSpent)
            .ToList();

        // Cost comparison: ingredients with 2+ suppliers
        var ingredientSupplierGroups = lots
            .Where(l => !string.IsNullOrEmpty(l.Supplier))
            .GroupBy(l => l.IngredientId)
            .Where(g => g.Select(l => l.Supplier).Distinct().Count() >= 2)
            .Select(g => new IngredientCostComparisonDto
            {
                IngredientName = ingredients.GetValueOrDefault(g.Key, "Unknown"),
                Suppliers = g
                    .GroupBy(l => l.Supplier!)
                    .Select(sg => new SupplierCostDto
                    {
                        Supplier = sg.Key,
                        UnitCost = sg.OrderByDescending(l => l.ReceivedAt).First().UnitCost,
                        LastPurchaseDate = sg.Max(l => l.ReceivedAt),
                        QtyPurchased = sg.Sum(l => l.InitialQuantity)
                    })
                    .OrderBy(s => s.UnitCost)
                    .ToList()
            })
            .ToList();

        return new SupplierBreakdownReportDto
        {
            SupplierSummary = supplierGroups,
            CostComparison = ingredientSupplierGroups
        };
    }

    public async Task<ConsumptionReportDto> GetConsumptionReportAsync(DateTime startDate, DateTime endDate)
    {
        var allMovements = await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate);
        var saleMovements = allMovements
            .Where(m => m.MovementType == MovementType.Sale)
            .ToList();

        var allIngredients = await _ingredientRepository.GetAllIncludingInactiveAsync();
        var ingredients = allIngredients.ToDictionary(i => i.Id, i => new { i.Name, i.Unit });

        var days = Math.Max(1, (endDate - startDate).Days + 1);

        var items = saleMovements
            .GroupBy(m => m.IngredientId)
            .Select(g =>
            {
                var qtyUsed = g.Sum(m => Math.Abs(m.Quantity));
                var costConsumed = g.Sum(m => Math.Abs(m.Quantity) * (m.UnitCost ?? 0));
                var info = ingredients.GetValueOrDefault(g.Key);
                return new ConsumptionItemDto
                {
                    IngredientName = info?.Name ?? "Unknown",
                    Unit = info?.Unit ?? "",
                    QtyUsed = qtyUsed,
                    CostConsumed = costConsumed,
                    AvgDaily = Math.Round(qtyUsed / days, 4)
                };
            })
            .OrderByDescending(i => i.CostConsumed)
            .ToList();

        var totalCost = items.Sum(i => i.CostConsumed);
        foreach (var item in items)
        {
            item.PercentOfTotal = totalCost > 0 ? Math.Round(item.CostConsumed / totalCost * 100, 1) : 0;
        }

        return new ConsumptionReportDto
        {
            TotalConsumedCost = totalCost,
            TopIngredientName = items.FirstOrDefault()?.IngredientName ?? "None",
            IngredientsUsedCount = items.Count,
            Items = items
        };
    }

    public async Task<PeriodComparisonDto> GetPeriodComparisonAsync(DateTime startDate, DateTime endDate)
    {
        var duration = endDate - startDate;
        var prevEnd = startDate.AddSeconds(-1);
        var prevStart = prevEnd - duration;

        var currentAll = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var currentTxns = currentAll.Where(t => t.Status == "completed").ToList();

        var previousAll = await _transactionRepository.GetByDateRangeAsync(prevStart, prevEnd);
        var previousTxns = previousAll.Where(t => t.Status == "completed").ToList();

        var currentSales = currentTxns.Sum(t => t.Total);
        var previousSales = previousTxns.Sum(t => t.Total);
        var currentCount = currentTxns.Count;
        var previousCount = previousTxns.Count;
        var currentAvg = currentCount > 0 ? currentSales / currentCount : 0;
        var previousAvg = previousCount > 0 ? previousSales / previousCount : 0;

        return new PeriodComparisonDto
        {
            CurrentSales = currentSales,
            PreviousSales = previousSales,
            SalesChangePercent = previousSales > 0 ? Math.Round((currentSales - previousSales) / previousSales * 100, 1) : 0,
            CurrentTransactions = currentCount,
            PreviousTransactions = previousCount,
            TransactionsChangePercent = previousCount > 0 ? Math.Round((decimal)(currentCount - previousCount) / previousCount * 100, 1) : 0,
            CurrentAvgOrder = Math.Round(currentAvg, 2),
            PreviousAvgOrder = Math.Round(previousAvg, 2),
            AvgOrderChangePercent = previousAvg > 0 ? Math.Round((currentAvg - previousAvg) / previousAvg * 100, 1) : 0
        };
    }
}
