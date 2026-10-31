using System.Text;
using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// OT-02 shape/consumption tests: the Sales export's "Top Products" and
/// "Sales by Category" sheets must print the REAL report values. The old
/// implementation read reflection props ("sales"/"sales"/"total"/"percent") that
/// never existed on the report shapes (they expose Revenue), so those columns
/// silently printed 0 — the reports methods return typed DTO rows now and the
/// export consumes them typed.
/// </summary>
public class ExportServiceSalesSheetsTests
{
    private static readonly DateTime RangeStart = new(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime RangeEnd = new(2026, 7, 31, 0, 0, 0, DateTimeKind.Utc);

    private static ExportService BuildService(Mock<IReportingService> reportingService)
    {
        var txnRepo = new Mock<ITransactionRepository>();
        txnRepo.Setup(r => r.GetByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<Transaction>());

        return new ExportService(
            reportingService.Object,
            txnRepo.Object,
            Mock.Of<IExpenseService>(),
            Mock.Of<IProductService>(),
            Mock.Of<IIngredientService>());
    }

    private static string[] RowAfter(List<string> lines, string marker, int index)
    {
        var markerIndex = lines.FindIndex(l => l.Trim() == marker);
        Assert.True(markerIndex >= 0, $"Expected a {marker} sheet block in the export.");
        return lines[markerIndex + 1 + index].Split(',');
    }

    [Fact]
    public async Task ExportAsync_SalesCsv_TopProductsRevenueColumn_PrintsRealRevenueNotZero()
    {
        var reporting = new Mock<IReportingService>();
        reporting.Setup(s => s.GetTopSellingProductsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), 50))
            .ReturnsAsync(new List<TopSellingProductDto>
            {
                new() { ProductId = "p1", Name = "Latte", Category = "Drinks", Quantity = 6, Revenue = 600m },
                new() { ProductId = "p2", Name = "Cake", Category = "Food", Quantity = 2, Revenue = 1000m }
            });
        reporting.Setup(s => s.GetCategoryReportAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<CategoryRevenueDto>());

        var result = await BuildService(reporting).ExportAsync(ExportSection.Sales, ExportFormat.Csv, RangeStart, RangeEnd);
        var lines = Encoding.UTF8.GetString(result.Content).Split('\r', '\n').Where(l => l.Length > 0).ToList();

        // Top Products header: Rank,Name,Category,Quantity Sold,Revenue — row 0 (rank 1).
        var header = RowAfter(lines, "TOP PRODUCTS", 0);
        var topRow = RowAfter(lines, "TOP PRODUCTS", 1);
        Assert.Equal(new[] { "Rank", "Name", "Category", "Quantity Sold", "Revenue" }, header);
        Assert.Equal(new[] { "1", "Latte", "Drinks", "6", "600.00" }, topRow);
        // The old bug rendered "0.00" here for every row.
        Assert.NotEqual("0.00", topRow[^1]);
        Assert.Equal("1000.00", RowAfter(lines, "TOP PRODUCTS", 2)[^1]);
    }

    [Fact]
    public async Task ExportAsync_SalesCsv_CategoryRows_PrintRealTotalsAndShares()
    {
        var reporting = new Mock<IReportingService>();
        reporting.Setup(s => s.GetTopSellingProductsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), 50))
            .ReturnsAsync(new List<TopSellingProductDto>());
        reporting.Setup(s => s.GetCategoryReportAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<CategoryRevenueDto>
            {
                new() { Category = "Drinks", Quantity = 6, Revenue = 600m },
                new() { Category = "Food", Quantity = 2, Revenue = 1000m }
            });

        var result = await BuildService(reporting).ExportAsync(ExportSection.Sales, ExportFormat.Csv, RangeStart, RangeEnd);
        var lines = Encoding.UTF8.GetString(result.Content).Split('\r', '\n').Where(l => l.Length > 0).ToList();

        // Sales by Category: Total = the category's real revenue, Percent = its
        // share of period revenue (600/1600 = 37.5%, 1000/1600 = 62.5%).
        var header = RowAfter(lines, "SALES BY CATEGORY", 0);
        var drinksRow = RowAfter(lines, "SALES BY CATEGORY", 1);
        var foodRow = RowAfter(lines, "SALES BY CATEGORY", 2);
        Assert.Equal(new[] { "Category", "Total", "Percent" }, header);
        Assert.Equal(new[] { "Drinks", "600.00", "37.50" }, drinksRow);
        Assert.Equal(new[] { "Food", "1000.00", "62.50" }, foodRow);
        // Shares tile the period exactly.
        Assert.Equal(100m, decimal.Parse(drinksRow[^1], System.Globalization.CultureInfo.InvariantCulture)
                          + decimal.Parse(foodRow[^1], System.Globalization.CultureInfo.InvariantCulture));
    }

    [Fact]
    public async Task ExportAsync_SalesCsv_EmptyPeriod_RendersSheetsWithoutCrash()
    {
        var reporting = new Mock<IReportingService>();
        reporting.Setup(s => s.GetTopSellingProductsAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), 50))
            .ReturnsAsync(new List<TopSellingProductDto>());
        reporting.Setup(s => s.GetCategoryReportAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new List<CategoryRevenueDto>());

        var result = await BuildService(reporting).ExportAsync(ExportSection.Sales, ExportFormat.Csv, RangeStart, RangeEnd);
        var text = Encoding.UTF8.GetString(result.Content);

        Assert.Contains("TOP PRODUCTS", text);
        Assert.Contains("SALES BY CATEGORY", text);
        Assert.Equal("text/csv", result.ContentType);
    }
}