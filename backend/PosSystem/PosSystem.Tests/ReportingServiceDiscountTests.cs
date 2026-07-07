using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// Regression tests for discount handling in accounting reports.
///
/// A stored Transaction.Total is already NET of line-level discounts (see
/// TransactionService.CreateTransactionAsync), and DiscountInfo.Amount is the whole-line
/// discount total (not per-unit). Reports must therefore:
///   - count each line's discount once (no "* Quantity"), and
///   - treat Total as net revenue (not subtract discounts a second time).
/// </summary>
public class ReportingServiceDiscountTests
{
    private static readonly DateTime RangeStart = new(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime RangeEnd = new(2026, 7, 1, 23, 59, 59, DateTimeKind.Utc);

    // One completed sale: 3 x P100 (gross line = P300) with a whole-line P60 discount (20% senior/PWD).
    // The backend stores Total already net of the discount: 300 - 60 = 240.
    private static List<Transaction> SingleDiscountedSale() => new()
    {
        new Transaction
        {
            Id = 1,
            Timestamp = new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc),
            Status = "completed",
            PaymentMethod = "cash",
            ServiceFee = 0m,
            Total = 240m,
            Items = new List<TransactionItem>
            {
                new TransactionItem
                {
                    ProductId = "p1",
                    Name = "Latte",
                    Category = "Drinks",
                    Price = 100m,
                    Quantity = 3,
                    Discount = new DiscountInfo { Type = "senior", Percentage = 20m, Amount = 60m }
                }
            }
        }
    };

    private static ReportingService BuildService(List<Transaction> transactions)
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

        var expenseService = new Mock<IExpenseService>();
        expenseService.Setup(e => e.GetTotalExpensesForPeriodAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                      .ReturnsAsync(0m);
        expenseService.Setup(e => e.GetExpensesByCategoryAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                      .ReturnsAsync(new List<ExpenseCategorySummaryDto>());
        expenseService.Setup(e => e.GetProratedExpensesForPeriodAsync(
                          It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
                      .ReturnsAsync(0m);

        // Not exercised by these report paths, but required by the constructor.
        var productRepo = new Mock<IProductRepository>();
        var lotRepo = new Mock<IIngredientLotRepository>();

        return new ReportingService(
            txnRepo.Object,
            productRepo.Object,
            ingredientRepo.Object,
            movementRepo.Object,
            lotRepo.Object,
            productIngredientRepo.Object,
            expenseService.Object);
    }

    [Fact]
    public async Task GetProfitLossReportAsync_WithLineLevelDiscount_CountsDiscountOnceAndKeepsNetRevenue()
    {
        // Arrange
        var service = BuildService(SingleDiscountedSale());

        // Act
        var report = await service.GetProfitLossReportAsync(RangeStart, RangeEnd);

        // Assert
        // Whole-line discount is P60 - NOT P60 x quantity(3) = P180.
        Assert.Equal(60m, report.TotalDiscounts);
        // Net revenue is the money actually recorded (Total is already net of discount): P240.
        Assert.Equal(240m, report.NetRevenue);
        // Gross revenue is the pre-discount list value: P240 + P60 = P300.
        Assert.Equal(300m, report.GrossRevenue);
        // With zero COGS, gross profit equals net revenue.
        Assert.Equal(240m, report.GrossProfit);
    }

    [Fact]
    public async Task GetAccountantSummaryAsync_WithLineLevelDiscount_CountsDiscountOnceAndKeepsNetRevenue()
    {
        // Arrange
        var service = BuildService(SingleDiscountedSale());

        // Act
        var summary = await service.GetAccountantSummaryAsync(RangeStart, RangeEnd);

        // Assert
        Assert.Equal(60m, summary.TotalDiscounts);
        Assert.Equal(240m, summary.NetRevenue);
        Assert.Equal(300m, summary.GrossRevenue);
        Assert.Equal(240m, summary.GrossProfit);
        // Average ticket is the actual amount paid per transaction.
        Assert.Equal(240m, summary.AverageTicket);
    }
}
