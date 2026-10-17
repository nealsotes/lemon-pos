using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// Pins defect <b>C2</b> from the SWI-6 reports spec (§3): for a single-day range the
/// Profit &amp; Loss statement and the Period Breakdown row immediately below it report two
/// different Expenses figures — and therefore two different Net Profit figures — for the
/// same day, on the same screen.
///
/// <para>
/// <b>Two of the tests in this class are EXPECTED TO FAIL on unmodified <c>main</c>.</b>
/// That failing state is the deliverable of SWI-10 (spec item R19 / work item W1b): it pins
/// the contradiction so it cannot be lost while the board decides which basis is correct.
/// Do NOT make them pass by changing either expense call site —
/// <c>ReportingService.cs:284</c> (<c>GetTotalExpensesForPeriodAsync</c>) or
/// <c>ReportingService.cs:367</c> (<c>GetProratedExpensesForPeriodAsync</c>). Reconciling
/// the two bases is spec item R20 / work item W14, and it is gated on the board answering
/// Q8: whether a single day's expenses are cash-basis (only expenses dated in the window)
/// or amortised (a share of expenses dated outside it).
/// </para>
///
/// <para>
/// The seed below is the minimum that makes the two paths diverge: one expense dated inside
/// the day under test, one dated outside it, and one monthly recurring template dated outside
/// it. Only the recurring template leaks across the window boundary, and only on the
/// breakdown side.
/// </para>
/// </summary>
public class ReportingServiceProfitLossConsistencyTests
{
    // The day under test. ReportsController.NormalizeDateRange turns a one-day request into
    // exactly this pair, so the statement window and the breakdown's day window are identical.
    private static readonly DateTime DayUnderTest = new(2026, 7, 15, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime RangeStart = DayUnderTest;
    private static readonly DateTime RangeEnd = DayUnderTest.AddDays(1).AddTicks(-1);

    private const string RentCategoryId = "cat-rent";
    private const string SuppliesCategoryId = "cat-supplies";

    // One completed sale on the day under test: P5,000.00, no discount, no service fee.
    // COGS is genuinely zero (no stock movements, no recipes), so Revenue / COGS / Gross Profit
    // are identical on both sides and expenses are the only input that can differ.
    private static List<Transaction> SingleSaleOnDayUnderTest() => new()
    {
        new Transaction
        {
            Id = 1,
            Timestamp = DayUnderTest.AddHours(10),
            Status = "completed",
            PaymentMethod = "cash",
            ServiceFee = 0m,
            Total = 5000m,
            Items = new List<TransactionItem>
            {
                new TransactionItem
                {
                    ProductId = "p1",
                    Name = "Latte",
                    Category = "Drinks",
                    Price = 1000m,
                    Quantity = 5
                }
            }
        }
    };

    private static List<Expense> SeededExpenses()
    {
        var rent = new ExpenseCategory { Id = RentCategoryId, Name = "Rent", IsSystem = true, IsActive = true, SortOrder = 1 };
        var supplies = new ExpenseCategory { Id = SuppliesCategoryId, Name = "Supplies", IsSystem = true, IsActive = true, SortOrder = 2 };

        return new List<Expense>
        {
            // (a) One-time, dated INSIDE the day under test. Both sides must count it.
            new Expense
            {
                Id = "exp-inside",
                CategoryId = SuppliesCategoryId,
                Category = supplies,
                Description = "Ice delivery",
                Amount = 1200m,
                Date = DayUnderTest.AddHours(9),
                IsRecurring = false,
                CreatedBy = "seed"
            },

            // (b) One-time, dated OUTSIDE the day under test. Neither side may count it.
            new Expense
            {
                Id = "exp-outside",
                CategoryId = SuppliesCategoryId,
                Category = supplies,
                Description = "Cups restock (previous day)",
                Amount = 999m,
                Date = DayUnderTest.AddDays(-1).AddHours(9),
                IsRecurring = false,
                CreatedBy = "seed"
            },

            // (c) Monthly recurring template dated OUTSIDE the day under test (the 1st).
            // No instance of it falls on the 15th. This is the expense that makes the two
            // paths diverge: the statement omits it, the breakdown amortises a share of it.
            new Expense
            {
                Id = "exp-rent-template",
                CategoryId = RentCategoryId,
                Category = rent,
                Description = "Shop rent",
                Amount = 31000m,
                Date = new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc),
                IsRecurring = true,
                RecurrenceType = "monthly",
                RecurrenceEndDate = null,
                CreatedBy = "seed"
            }
        };
    }

    /// <summary>
    /// Builds a ReportingService over a REAL ExpenseService. The expense arithmetic under test
    /// lives in ExpenseService, so mocking IExpenseService (as ReportingServiceDiscountTests
    /// does) would hide the defect.
    /// </summary>
    private static ReportingService BuildService(List<Transaction> transactions, List<Expense> expenses)
    {
        var txnRepo = new Mock<ITransactionRepository>();
        txnRepo.Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
               .ReturnsAsync(transactions);

        var movementRepo = new Mock<IStockMovementRepository>();
        movementRepo.Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                    .ReturnsAsync(new List<StockMovement>());

        var ingredientRepo = new Mock<IIngredientRepository>();
        ingredientRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Ingredient>());

        var productIngredientRepo = new Mock<IProductIngredientRepository>();
        productIngredientRepo.Setup(r => r.GetAllWithIngredientsAsync())
                             .ReturnsAsync(new List<ProductIngredient>());

        var expenseService = new ExpenseService(
            BuildExpenseRepository(expenses).Object,
            new Mock<IExpenseCategoryRepository>().Object);

        // Not exercised by this report path, but required by the constructor.
        var productRepo = new Mock<IProductRepository>();
        var lotRepo = new Mock<IIngredientLotRepository>();

        return new ReportingService(
            txnRepo.Object,
            productRepo.Object,
            ingredientRepo.Object,
            movementRepo.Object,
            lotRepo.Object,
            productIngredientRepo.Object,
            expenseService);
    }

    /// <summary>
    /// In-memory stand-in for ExpenseRepository. Each setup mirrors the production query
    /// predicate in Infrastructure/Repositories/ExpenseRepository.cs exactly.
    /// </summary>
    private static Mock<IExpenseRepository> BuildExpenseRepository(List<Expense> expenses)
    {
        var repo = new Mock<IExpenseRepository>();

        repo.Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync((DateTime start, DateTime end) => expenses
                .Where(e => !e.IsRecurring && e.ParentExpenseId == null
                    && e.Date >= start && e.Date <= end)
                .OrderByDescending(e => e.Date)
                .ToList());

        repo.Setup(r => r.GetRecurringTemplatesAsync())
            .ReturnsAsync(() => expenses
                .Where(e => e.IsRecurring && e.ParentExpenseId == null)
                .OrderBy(e => e.Date)
                .ToList());

        repo.Setup(r => r.GetOverridesForParentAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync((string parentExpenseId, DateTime start, DateTime end) => expenses
                .Where(e => e.ParentExpenseId == parentExpenseId
                    && e.Date >= start && e.Date <= end)
                .ToList());

        return repo;
    }

    /// <summary>
    /// Control case — EXPECTED TO PASS. Establishes that revenue, COGS and gross profit are
    /// consistent between the statement and the breakdown, so the two tests below isolate
    /// expenses as the only differing input (spec §3, C2).
    /// </summary>
    [Fact]
    public async Task GetProfitLossReportAsync_SingleDayRange_RevenueCogsAndGrossProfitAgreeWithBreakdown()
    {
        // Arrange
        var service = BuildService(SingleSaleOnDayUnderTest(), SeededExpenses());

        // Act
        var report = await service.GetProfitLossReportAsync(RangeStart, RangeEnd);

        // Assert
        var row = Assert.Single(report.Breakdown);

        Assert.Equal(5000m, report.NetRevenue);
        Assert.Equal(5000m, row.Revenue);

        Assert.Equal(0m, report.Cogs);
        Assert.Equal(0m, row.Cogs);

        Assert.Equal(5000m, report.GrossProfit);
        Assert.Equal(5000m, row.GrossProfit);
    }

    /// <summary>
    /// <b>EXPECTED TO FAIL on unmodified <c>main</c> — this is the SWI-10 deliverable.</b>
    ///
    /// <para>
    /// R19: for a one-day range, <c>profit-loss</c> must satisfy
    /// <c>totalExpenses == Σ breakdown[].expenses</c>.
    /// </para>
    ///
    /// <para>
    /// The statement reports P1,200.00 — the one expense dated inside the window (cash basis).
    /// The breakdown reports that plus an amortised share of the P31,000.00 monthly rent
    /// template dated 2026-07-01, which is outside the window entirely. The fractional tail on
    /// the breakdown figure is the amortisation divide in
    /// <c>ExpenseService.ProrateRecurringExpense</c>.
    /// </para>
    /// </summary>
    [Fact]
    public async Task GetProfitLossReportAsync_SingleDayRange_StatementExpensesEqualBreakdownExpenses()
    {
        // Arrange
        var service = BuildService(SingleSaleOnDayUnderTest(), SeededExpenses());

        // Act
        var report = await service.GetProfitLossReportAsync(RangeStart, RangeEnd);
        var breakdownExpenses = report.Breakdown.Sum(p => p.Expenses);

        // Assert
        // The statement side is cash-basis and exact: only the P1,200.00 expense dated on the
        // day under test. The P999.00 expense dated the day before is correctly excluded.
        Assert.Equal(1200m, report.TotalExpenses);

        // The breakdown covers the identical window, so it must report the identical figure.
        Assert.Equal(report.TotalExpenses, breakdownExpenses);
    }

    /// <summary>
    /// <b>EXPECTED TO FAIL on unmodified <c>main</c> — this is the SWI-10 deliverable.</b>
    ///
    /// <para>
    /// R19: for a one-day range, <c>profit-loss</c> must satisfy
    /// <c>netProfit == Σ breakdown[].netProfit</c>. Both figures are labelled "Net Profit" for
    /// the same day and are shown on screen together, so at least one of them is wrong and the
    /// page gives the Owner no way to tell which (spec §3, C2 — classified broken).
    /// </para>
    /// </summary>
    [Fact]
    public async Task GetProfitLossReportAsync_SingleDayRange_StatementNetProfitEqualsBreakdownNetProfit()
    {
        // Arrange
        var service = BuildService(SingleSaleOnDayUnderTest(), SeededExpenses());

        // Act
        var report = await service.GetProfitLossReportAsync(RangeStart, RangeEnd);
        var breakdownNetProfit = report.Breakdown.Sum(p => p.NetProfit);

        // Assert
        // Gross profit P5,000.00 less the cash-basis expenses P1,200.00.
        Assert.Equal(3800m, report.NetProfit);

        // Same day, same window, same gross profit — so the net profit must match too.
        Assert.Equal(report.NetProfit, breakdownNetProfit);
    }
}
