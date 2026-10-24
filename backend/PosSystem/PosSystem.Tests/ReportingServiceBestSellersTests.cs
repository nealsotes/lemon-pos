using Moq;
using System.Text.Json;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// Tests for the best-sellers aggregation that backs the "Best seller" badges
/// (ProductsController GET /api/products/best-sellers → ReportingService
/// .GetTopSellingProductsAsync). Pins ranking by quantity sold, revenue
/// summation, and the requested take count.
///
/// The service returns anonymous-typed rows, so assertions go through JSON
/// round-tripping (dynamic binding cannot see internal types from this
/// assembly). Serializer uses default property casing → PascalCase keys, which
/// is exactly what the frontend maps over.
/// </summary>
public class ReportingServiceBestSellersTests
{
    private static readonly DateTime RangeStart = new(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime RangeEnd = new(2026, 7, 31, 23, 59, 59, DateTimeKind.Utc);

    private static List<Transaction> MixedSales() => new()
    {
        new Transaction
        {
            Id = 1,
            Timestamp = new DateTime(2026, 7, 3, 10, 0, 0, DateTimeKind.Utc),
            Status = "completed",
            Items = new List<TransactionItem>
            {
                new TransactionItem { ProductId = "p1", Name = "Latte", Category = "Drinks", Price = 100m, Quantity = 5 },
                new TransactionItem { ProductId = "p2", Name = "Croissant", Category = "Food", Price = 80m, Quantity = 2 }
            }
        },
        new Transaction
        {
            Id = 2,
            Timestamp = new DateTime(2026, 7, 10, 15, 0, 0, DateTimeKind.Utc),
            Status = "completed",
            Items = new List<TransactionItem>
            {
                new TransactionItem { ProductId = "p1", Name = "Latte", Category = "Drinks", Price = 100m, Quantity = 1 },
                new TransactionItem { ProductId = "p3", Name = "Cake", Category = "Food", Price = 500m, Quantity = 2 }
            }
        }
    };

    private static ReportingService BuildService(List<Transaction> transactions)
    {
        var txnRepo = new Mock<ITransactionRepository>();
        txnRepo.Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
               .ReturnsAsync(transactions);

        var productRepo = new Mock<IProductRepository>();
        var movementRepo = new Mock<IStockMovementRepository>();
        var ingredientRepo = new Mock<IIngredientRepository>();
        var lotRepo = new Mock<IIngredientLotRepository>();
        var productIngredientRepo = new Mock<IProductIngredientRepository>();

        // Not exercised by this report path, but required by the constructor
        // (same pattern as ReportingServiceDiscountTests).
        var expenseService = new Mock<IExpenseService>();

        return new ReportingService(
            txnRepo.Object,
            productRepo.Object,
            ingredientRepo.Object,
            movementRepo.Object,
            lotRepo.Object,
            productIngredientRepo.Object,
            expenseService.Object);
    }

    /// <summary>JSON round-trip the anonymous rows so assertions can read them.</summary>
    private static JsonDocument AsJson(object result)
    {
        var json = JsonSerializer.Serialize(result);
        return JsonDocument.Parse(json);
    }

    [Fact]
    public async Task GetTopSellingProductsAsync_MixedSales_RanksByQuantitySold()
    {
        var service = BuildService(MixedSales());

        using var json = AsJson(await service.GetTopSellingProductsAsync(RangeStart, RangeEnd));

        var rows = json.RootElement.EnumerateArray().ToList();
        // p1 sold 6 across both transactions — must rank first.
        Assert.Equal("p1", rows[0].GetProperty("ProductId").GetString());
        Assert.Equal(3, rows.Count);
        Assert.Contains(rows, r => r.GetProperty("ProductId").GetString() == "p2");
        Assert.Contains(rows, r => r.GetProperty("ProductId").GetString() == "p3");
    }

    [Fact]
    public async Task GetTopSellingProductsAsync_SumsQuantityAndRevenueAcrossTransactions()
    {
        var service = BuildService(MixedSales());

        using var json = AsJson(await service.GetTopSellingProductsAsync(RangeStart, RangeEnd));

        var latte = json.RootElement.EnumerateArray()
            .First(r => r.GetProperty("ProductId").GetString() == "p1");
        // 5 + 1 sold over two transactions, revenue = (5+1) x 100.
        Assert.Equal(6, latte.GetProperty("Quantity").GetInt32());
        Assert.Equal(600m, latte.GetProperty("Revenue").GetDecimal());
    }

    [Fact]
    public async Task GetTopSellingProductsAsync_RespectsTakeCount()
    {
        var service = BuildService(MixedSales());

        using var json = AsJson(await service.GetTopSellingProductsAsync(RangeStart, RangeEnd, 2));

        var rows = json.RootElement.EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal("p1", rows[0].GetProperty("ProductId").GetString());
    }
}