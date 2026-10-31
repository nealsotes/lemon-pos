using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for the read/report side of TransactionService — previously zero
/// coverage. Pins the PH-business-day conversion the write path introduced (OT-01):
/// a wall date becomes the exact UTC half-open window <c>[start, end)</c> handed to
/// the repository without day-snapping; plus the sales sum and the daily report
/// aggregation (count, average, top products by quantity, capped at five).
/// </summary>
public class TransactionServiceQueryTests
{
    private readonly Mock<ITransactionRepository> _repository = new();
    private readonly TransactionService _service;

    public TransactionServiceQueryTests()
    {
        var context = new PosSystemDbContext(
            new DbContextOptionsBuilder<PosSystemDbContext>()
                .UseInMemoryDatabase($"query-{Guid.NewGuid()}")
                .Options);
        _service = new TransactionService(
            _repository.Object,
            new Mock<IProductRepository>().Object,
            new Mock<IInventoryService>().Object,
            new Mock<IIngredientLotService>().Object,
            new Mock<IIngredientRepository>().Object,
            new Mock<IProductIngredientRepository>().Object,
            new Mock<IUnitOfWork>().Object,
            context);
    }

    private static Transaction Tx(decimal total, params TransactionItem[] items)
    {
        var transaction = new Transaction { Id = Random.Shared.Next(1, 1_000_000), Total = total };
        transaction.Items.AddRange(items);
        return transaction;
    }

    private static TransactionItem Item(string productId, int quantity, decimal price)
    {
        return new TransactionItem { ProductId = productId, Name = productId, Price = price, Quantity = quantity };
    }

    [Fact]
    public async Task GetAllTransactionsAsync_DelegatesToRepository()
    {
        var transactions = new List<Transaction> { Tx(10m) };
        _repository.Setup(r => r.GetAllAsync()).ReturnsAsync(transactions);

        Assert.Same(transactions, await _service.GetAllTransactionsAsync());
    }

    [Fact]
    public async Task GetTransactionByIdAsync_DelegatesToRepository()
    {
        var transaction = Tx(10m);
        _repository.Setup(r => r.GetByIdAsync(7)).ReturnsAsync(transaction);

        Assert.Same(transaction, await _service.GetTransactionByIdAsync(7));
    }

    [Fact]
    public async Task GetTransactionByIdAsync_UnknownId_ReturnsNull()
    {
        _repository.Setup(r => r.GetByIdAsync(99)).ReturnsAsync((Transaction?)null);

        Assert.Null(await _service.GetTransactionByIdAsync(99));
    }

    [Fact]
    public async Task GetTransactionsByDateAsync_ConvertsPhWallDayToExactUtcHalfOpenWindow()
    {
        DateTime capturedStart = DateTime.MaxValue;
        DateTime capturedEnd = DateTime.MaxValue;
        _repository
            .Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .Callback<DateTime, DateTime>((start, end) => { capturedStart = start; capturedEnd = end; })
            .ReturnsAsync(new List<Transaction>());

        await _service.GetTransactionsByDateAsync(new DateTime(2026, 10, 31, 0, 0, 0));

        // [2026-10-30 16:00Z, 2026-10-31 16:00Z) is the whole PH day of 2026-10-31.
        Assert.Equal(new DateTime(2026, 10, 30, 16, 0, 0), capturedStart);
        Assert.Equal(new DateTime(2026, 10, 31, 16, 0, 0), capturedEnd);
        Assert.Equal(DateTimeKind.Utc, capturedStart.Kind);
        Assert.Equal(DateTimeKind.Utc, capturedEnd.Kind);
    }

    [Fact]
    public async Task GetTransactionsByDateRangeAsync_PassesWindowUntouched()
    {
        var start = new DateTime(2026, 10, 1, 16, 0, 0);
        var end = new DateTime(2026, 10, 2, 16, 0, 0);
        var transactions = new List<Transaction> { Tx(1m) };
        _repository.Setup(r => r.GetByDateRangeAsync(start, end)).ReturnsAsync(transactions);

        var result = await _service.GetTransactionsByDateRangeAsync(start, end);

        // The service is a straight pipe here: callers already converted to UTC.
        Assert.Same(transactions, result);
        _repository.Verify(r => r.GetByDateRangeAsync(start, end), Times.Once);
    }

    [Fact]
    public async Task GetTotalSalesAsync_SumsTotalsOfThePhBusinessDay()
    {
        var day = new List<Transaction> { Tx(120.50m), Tx(80m), Tx(0.25m) };
        _repository
            .Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(day);

        var total = await _service.GetTotalSalesAsync(new DateTime(2026, 10, 31, 0, 0, 0));

        Assert.Equal(200.75m, total);
    }

    [Fact]
    public async Task GetTotalSalesAsync_EmptyDay_ReturnsZero()
    {
        _repository
            .Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Transaction>());

        Assert.Equal(0m, await _service.GetTotalSalesAsync(new DateTime(2026, 10, 31, 0, 0, 0)));
    }

    [Fact]
    public async Task GetDailyReportAsync_AggregatesTotalsCountAverageAndTopProducts()
    {
        var day = new List<Transaction>
        {
            Tx(160m,
                Item("P1", 5, 10m),
                Item("P2", 4, 10m),
                Item("P3", 3, 10m),
                Item("P4", 2, 10m),
                Item("P5", 1, 10m),
                Item("P6", 1, 10m))
        };
        _repository
            .Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(day);

        var report = await _service.GetDailyReportAsync(new DateTime(2026, 10, 31, 0, 0, 0));
        var type = report.GetType();

        var totalSales = (decimal)type.GetProperty("TotalSales")!.GetValue(report)!;
        var transactionCount = (int)type.GetProperty("TransactionCount")!.GetValue(report)!;
        var average = (decimal)type.GetProperty("AverageTransactionValue")!.GetValue(report)!;
        var reportedDate = (DateTime)type.GetProperty("Date")!.GetValue(report)!;
        Assert.Equal(160m, totalSales);
        Assert.Equal(1, transactionCount);
        Assert.Equal(160m, average);
        Assert.Equal(new DateTime(2026, 10, 31), reportedDate);

        // Top products: ordered by quantity, revenue = price x quantity, capped at 5
        // — P6 falls off the list even though a P6 sale exists.
        var top = (System.Collections.IEnumerable)type.GetProperty("TopProducts")!.GetValue(report)!;
        var rows = top.Cast<object>().ToList();
        Assert.Equal(5, rows.Count);
        static object RowProp(object row, string name) => row.GetType().GetProperty(name)!.GetValue(row)!;
        Assert.Equal("P1", (string)RowProp(rows[0], "ProductId"));
        Assert.Equal(5, (int)RowProp(rows[0], "Quantity"));
        Assert.Equal(50m, (decimal)RowProp(rows[0], "Revenue"));
        // rows[4] is the last survivor (P5 or P6 — both qty 1, revenue 10).
        Assert.Equal(10m, (decimal)RowProp(rows[4], "Revenue"));
        Assert.DoesNotContain(rows, row => "P6".Equals((string)RowProp(row, "ProductId")));
    }

    [Fact]
    public async Task GetDailyReportAsync_EmptyDay_ReportsZerosWithoutDividingByZero()
    {
        _repository
            .Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Transaction>());

        var report = await _service.GetDailyReportAsync(new DateTime(2026, 10, 31, 0, 0, 0));
        var type = report.GetType();

        Assert.Equal(0m, (decimal)type.GetProperty("TotalSales")!.GetValue(report)!);
        Assert.Equal(0, (int)type.GetProperty("TransactionCount")!.GetValue(report)!);
        Assert.Equal(0m, (decimal)type.GetProperty("AverageTransactionValue")!.GetValue(report)!);
        Assert.Empty((System.Collections.IEnumerable)type.GetProperty("TopProducts")!.GetValue(report)!);
    }

    // The service must not re-derive windows from UTC directly — PhilippineTime is
    // the contract. (Reference kept so a rename breaks the test at compile time.)
    [Fact]
    public void PhilippineTime_Constant_IsAnEightHourUtcOffset()
    {
        Assert.Equal(8, PhilippineTime.UtcOffsetHours);
    }
}