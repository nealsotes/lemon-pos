using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;

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

    /// <summary>
    /// One PH business day's report. `date` is a Philippine wall date; the window is
    /// that calendar day in the exact UTC form the transaction repository now takes
    /// (roadmap item 2, OT-01: bucketing by UTC instant-days used to file PH-morning
    /// sales into the previous day's report).
    /// </summary>
    public async Task<object> GetDailyReportAsync(DateTime date)
    {
        var (startOfWindow, endOfWindowExclusive) = PhilippineTime.DayUtc(date);

        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startOfWindow, endOfWindowExclusive);
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

        // The wall date the requester asked for, echoed back for display.
        return new
        {
            Date = date.Date,
            TotalSales = totalSales,
            TransactionCount = transactionCount,
            AverageTransactionValue = averageTransactionValue,
            TopProducts = topProducts
        };
    }

    /// <summary>
    /// Sales by PH business day. (startDate, endDate) is the controller's normalized
    /// exact UTC half-open window covering the requested PH wall dates. Each sale is
    /// bucketed onto its Philippine calendar date — the pre-fix bucket on the UTC
    /// instant's date sent 00:00–07:59 PH sales into the previous bucket (roadmap
    /// item 2, OT-01).
    /// </summary>
    public async Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate)
    {
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var transactions = allTransactions.ToList();

        var dailySales = transactions
            .GroupBy(t => PhilippineTime.ToWall(t.Timestamp).Date)
            .Select(g => new
            {
                Date = g.Key,
                TotalSales = g.Sum(t => t.Total),
                TransactionCount = g.Count()
            })
            .OrderBy(x => x.Date)
            .ToList();

        // Echo the requested PH wall dates so the reports page labels the range the
        // way the owner picked it, not the UTC storage bounds.
        var wallStart = PhilippineTime.ToWall(startDate).Date;
        var wallEnd = PhilippineTime.ToWall(endDate).AddTicks(-1).Date;

        return new
        {
            StartDate = wallStart,
            EndDate = wallEnd,
            TotalSales = transactions.Sum(t => t.Total),
            TotalTransactions = transactions.Count,
            DailySales = dailySales
        };
    }

    // OT-02: typed DTO rows (were Task<object> anonymous types). Same PascalCase
    // property names, so the wires these endpoints drive (/api/reports, the
    // best-sellers consumers) serialize identically — only consumers compile
    // against real types now, instead of reflection-guessing prop names.
    public async Task<List<TopSellingProductDto>> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10)
    {
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);

        var topProducts = allTransactions
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new TopSellingProductDto
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

    public async Task<List<CategoryRevenueDto>> GetCategoryReportAsync(DateTime startDate, DateTime endDate)
    {
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var products = (await _productRepository.GetAllAsync()).ToDictionary(p => p.Id);

        var categorySales = allTransactions
            .SelectMany(t => t.Items)
            .Where(item => products.ContainsKey(item.ProductId))
            .GroupBy(item => products[item.ProductId].Category)
            .Select(g => new CategoryRevenueDto
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

    private async Task<decimal> CalculateTotalCogsFromMovementsAsync(DateTime startUtc, DateTime endUtcExclusive)
    {
        // Movement repository windows are inclusive in their end; the reporting
        // windows are half-open. Subtracting the closing tick keeps the statement and
        // every breakdown row as exact partitions of the same movement set.
        var movements = await _stockMovementRepository.GetByDateRangeAsync(startUtc, endUtcExclusive.AddTicks(-1));
        // Line-level rounding (roadmap item 2, DP-01): each movement's money is
        // rounded to the peso scale before it is summed, so a 18,4-scale movement
        // quantity can never leave fractional-pesos tails in an aggregate, and the
        // statement and the breakdown rows (which partition these movements) add up
        // to truly identical decimals instead of differing in the 4th decimal.
        return movements
            .Where(m => m.MovementType == MovementType.Sale)
            .Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));
    }

    private decimal CalculateCogsForItems(
        IEnumerable<TransactionItem> items,
        Dictionary<string, decimal> cogsByProduct)
    {
        return items.Sum(item =>
        {
            cogsByProduct.TryGetValue(item.ProductId, out var costPerUnit);
            return Math.Round(costPerUnit * item.Quantity, 2, MidpointRounding.AwayFromZero);
        });
    }

    // ── Profit & Loss ──

    public async Task<ProfitLossReportDto> GetProfitLossReportAsync(DateTime startDate, DateTime endDate)
    {
        var allTransactions = await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
        var transactions = allTransactions.Where(t => t.Status == "completed").ToList();

        var allItems = transactions.SelectMany(t => t.Items).ToList();

        // Transaction.Total is stored already net of line-level discounts (see
        // TransactionService.CreateTransactionAsync), so it IS net revenue. DiscountInfo.Amount is
        // the whole-line discount total (not per-unit), so it must NOT be multiplied by Quantity.
        var netRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount);
        var grossRevenue = netRevenue + totalDiscounts;

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
        var marginPercent = netRevenue > 0 ? Math.Round((grossProfit / netRevenue) * 100, 2, MidpointRounding.AwayFromZero) : 0;

        // Expenses integration. The expense repositories compare with an inclusive
        // end, so the statement window gets the same [.., closing-tick] coverage the
        // breakdown rows tile below — the two sides remain exact partitions of one
        // expense set (roadmap item 2: C2 statement/breakdown reconciliation).
        var expenseWindowEnd = endDate.AddTicks(-1);
        var totalExpenses = await _expenseService.GetTotalExpensesForPeriodAsync(startDate, expenseWindowEnd);
        var expensesByCategory = await _expenseService.GetExpensesByCategoryAsync(startDate, expenseWindowEnd);
        var netProfit = grossProfit - totalExpenses;
        var netMarginPercent = netRevenue > 0 ? Math.Round((netProfit / netRevenue) * 100, 2, MidpointRounding.AwayFromZero) : 0;

        // All sale movements for period breakdown (Fix 2: use movements for breakdown too)
        var allMovements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, expenseWindowEnd))
            .Where(m => m.MovementType == MovementType.Sale)
            .ToList();

        // ── Period breakdown ──
        // The rows are an EXACT partition of the statement window [startDate,
        // endDate): every transaction, expense and movement instant falls into
        // exactly one row, so Σ breakdown rows == the statement figures for every
        // range shape — with or without sales on the day (the shop-closed-Monday
        // case). The window is sliced in day steps from its start; when the window
        // is the controller's normalized PH-day pair (PhilippineTime, OT-01), each
        // slice IS one Philippine calendar day and a 23:00-UTC sale lands in its
        // own morning's day; when a caller hands the service a raw instant window
        // that is not PH-day aligned (e.g. midnight-to-midnight UTC), the slices
        // remain exact pieces of the stated window instead of stretching into full
        // wall days, which would double- or under-count against the statement.
        var breakdown = new List<ProfitLossPeriodDto>();

        if (endDate > startDate)
        {
            var stepDays = (endDate - startDate).TotalDays > 60 ? 7 : 1;
            var windowTicks = (endDate - startDate).Ticks;
            var stepTicks = TimeSpan.TicksPerDay * stepDays;
            var pieceCount = (windowTicks + stepTicks - 1) / stepTicks;

            for (var piece = 0; piece < pieceCount; piece++)
            {
                var pieceStart = startDate + TimeSpan.FromTicks(stepTicks * piece);
                var pieceEndExclusive = piece == pieceCount - 1
                    ? endDate
                    : pieceStart + TimeSpan.FromTicks(stepTicks);

                var label = stepDays == 7
                    ? $"{PhilippineTime.ToWall(pieceStart):MMM dd} – {PhilippineTime.ToWall(pieceEndExclusive).AddTicks(-1):MMM dd}"
                    : PhilippineTime.ToWall(pieceStart).Date.ToString("MMM dd");

                breakdown.Add(await BuildPeriodRow(
                    txns: transactions
                        .Where(t => t.Timestamp >= pieceStart && t.Timestamp < pieceEndExclusive)
                        .ToList(),
                    movementStartUtc: pieceStart,
                    movementEndInclusiveUtc: pieceEndExclusive.AddTicks(-1),
                    expenseStartUtc: pieceStart,
                    expenseEndInclusiveUtc: pieceEndExclusive.AddTicks(-1),
                    allMovements: allMovements,
                    cogsByProduct: cogsByProduct,
                    label: label));
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

    /// <summary>
    /// One P&amp;L breakdown row (a PH day, or a 7-day block of them). COGS comes
    /// from the window's sale movements — rounded per movement, never mid-aggregate
    /// (DP-01) — with the same recipe fallback the statement uses for the legacy
    /// gap of a sale whose movement records are missing. Expenses come from the
    /// same cash-basis generation the statement side uses, over exactly this
    /// window. Windows arrive pre-converted to each repository's convention.
    /// </summary>
    private async Task<ProfitLossPeriodDto> BuildPeriodRow(
        List<Transaction> txns,
        DateTime movementStartUtc,
        DateTime movementEndInclusiveUtc,
        DateTime expenseStartUtc,
        DateTime expenseEndInclusiveUtc,
        List<StockMovement> allMovements,
        Dictionary<string, decimal> cogsByProduct,
        string label)
    {
        var rev = txns.Sum(t => t.Total);
        var periodCogs = allMovements
            .Where(m => m.CreatedAt >= movementStartUtc && m.CreatedAt <= movementEndInclusiveUtc)
            .Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));
        if (periodCogs == 0 && rev > 0)
        {
            // Movement records missing (legacy sales predate per-sale movements):
            // fall back to the recipe cost map, the same basis the statement uses.
            periodCogs = CalculateCogsForItems(txns.SelectMany(t => t.Items), cogsByProduct);
        }
        var profit = rev - periodCogs;
        var expenses = await _expenseService.GetProratedExpensesForPeriodAsync(
            expenseStartUtc, expenseEndInclusiveUtc, movementStartUtc, movementEndInclusiveUtc);
        var netProfit = profit - expenses;
        return new ProfitLossPeriodDto
        {
            Period = label,
            Revenue = rev,
            Cogs = periodCogs,
            GrossProfit = profit,
            MarginPercent = rev > 0 ? Math.Round((profit / rev) * 100, 2, MidpointRounding.AwayFromZero) : 0,
            Expenses = expenses,
            NetProfit = netProfit,
            NetMarginPercent = rev > 0 ? Math.Round((netProfit / rev) * 100, 2, MidpointRounding.AwayFromZero) : 0
        };
    }

    // ── Inventory Valuation ──

    public async Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate)
    {
        var ingredients = (await _ingredientRepository.GetAllAsync()).ToList();

        var totalValue = ingredients.Sum(i => (i.UnitCost ?? 0) * i.Quantity);
        var lowStockCount = ingredients.Count(i => i.Quantity <= i.LowStockThreshold);

        // Stock movements in period
        var movements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate.AddTicks(-1))).ToList();

        // Period change: purchases/returns add value, sales/waste/adjustments subtract.
        // Line-level rounding (DP-01): money is rounded per movement before summing.
        var periodChange = movements.Sum(m =>
        {
            var cost = Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero);
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
            .Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));

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
                TotalCost = g.Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero))
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

        // See GetProfitLossReportAsync: Total is already net of discounts, and DiscountInfo.Amount
        // is a whole-line total, so do not subtract twice or scale by Quantity.
        var netRevenue = transactions.Sum(t => t.Total);
        var totalDiscounts = allItems
            .Where(i => i.Discount != null)
            .Sum(i => i.Discount!.Amount);
        var grossRevenue = netRevenue + totalDiscounts;
        var totalCogs = await CalculateTotalCogsFromMovementsAsync(startDate, endDate);
        var grossProfit = netRevenue - totalCogs;
        var transactionCount = transactions.Count;
        var averageTicket = transactionCount > 0 ? netRevenue / transactionCount : 0;

        // Expense/movement repositories take an inclusive closing instant; the
        // reporting window is half-open, so subtract the boundary tick (roadmap
        // item 2 DP-01: one boundary convention, stated once at the boundary).
        var windowEndInclusive = endDate.AddTicks(-1);
        var totalExpenses = await _expenseService.GetTotalExpensesForPeriodAsync(startDate, windowEndInclusive);
        var expensesByCategory = await _expenseService.GetExpensesByCategoryAsync(startDate, windowEndInclusive);
        var netProfit = grossProfit - totalExpenses;
        var netMarginPercent = netRevenue > 0 ? Math.Round((netProfit / netRevenue) * 100, 2, MidpointRounding.AwayFromZero) : 0;

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

        var movements = (await _stockMovementRepository.GetByDateRangeAsync(startDate, windowEndInclusive)).ToList();

        var ingredientsConsumed = movements
            .Where(m => m.MovementType == MovementType.Sale)
            .Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));

        var wasteAndShrinkage = movements
            .Where(m => m.MovementType == MovementType.Waste ||
                        (m.MovementType == MovementType.Adjustment && m.Quantity < 0))
            .Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));

        return new AccountantSummaryDto
        {
            StartDate = startDate,
            EndDate = endDate,
            GrossRevenue = grossRevenue,
            TotalDiscounts = totalDiscounts,
            NetRevenue = netRevenue,
            Cogs = totalCogs,
            GrossProfit = grossProfit,
            GrossMarginPercent = netRevenue > 0 ? Math.Round((grossProfit / netRevenue) * 100, 2, MidpointRounding.AwayFromZero) : 0,
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
        var lots = (await _ingredientLotRepository.GetByDateRangeAsync(startDate, endDate.AddTicks(-1))).ToList();

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
                TotalSpent = g.Sum(l => Math.Round(l.InitialQuantity * l.UnitCost, 2, MidpointRounding.AwayFromZero)),
                Ingredients = g
                    .Select(l => ingredients.GetValueOrDefault(l.IngredientId, "Unknown"))
                    .Distinct()
                    .ToList(),
                AvgCostPerPurchase = g.Count() > 0
                    ? Math.Round(g.Sum(l => Math.Round(l.InitialQuantity * l.UnitCost, 2, MidpointRounding.AwayFromZero)) / g.Count(), 2, MidpointRounding.AwayFromZero)
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
        var allMovements = await _stockMovementRepository.GetByDateRangeAsync(startDate, endDate.AddTicks(-1));
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
                var costConsumed = g.Sum(m => Math.Round(Math.Abs(m.Quantity) * (m.UnitCost ?? 0), 2, MidpointRounding.AwayFromZero));
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
        // Windows are half-open [start, end): the previous block is the immediately
        // preceding window of the same length — [start - duration, start) — with no
        // 1-second shift between the blocks.
        var duration = endDate - startDate;
        var prevEnd = startDate;
        var prevStart = startDate - duration;

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
