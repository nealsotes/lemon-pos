using System.Text;
using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// Tests for the low-stock ingredients export. The export must render the reorder list and
/// must REUSE IngredientService.GetReorderSuggestionsAsync (the single home of the
/// "Quantity &lt;= per-item LowStockThreshold" rule) rather than re-deriving low-stock itself.
/// </summary>
public class ExportServiceLowStockTests
{
    private static ExportService BuildService(Mock<IIngredientService> ingredientService) =>
        new(
            Mock.Of<IReportingService>(),
            Mock.Of<ITransactionRepository>(),
            Mock.Of<IExpenseService>(),
            Mock.Of<IProductService>(),
            ingredientService.Object);

    [Fact]
    public async Task ExportLowStockIngredientsAsync_Csv_RendersHeaderAndLowStockRows()
    {
        // Arrange
        var lowStock = new List<Ingredient>
        {
            new() { Name = "Milk", Unit = "L", Quantity = 1m, LowStockThreshold = 5m, Supplier = "DairyCo" },
            new() { Name = "Sugar", Unit = "kg", Quantity = 2m, LowStockThreshold = 3m }
        };
        var ingredientService = new Mock<IIngredientService>();
        ingredientService.Setup(s => s.GetReorderSuggestionsAsync()).ReturnsAsync(lowStock);

        // Act
        var result = await BuildService(ingredientService).ExportLowStockIngredientsAsync(ExportFormat.Csv);
        var text = Encoding.UTF8.GetString(result.Content);

        // Assert
        Assert.Contains("Low Stock Threshold", text);
        Assert.Contains("Shortfall", text);
        Assert.Contains("Milk", text);
        Assert.Contains("Sugar", text);
        Assert.Contains("2 item(s) low on stock", text);
        Assert.EndsWith(".csv", result.FileName);
        Assert.Equal("text/csv", result.ContentType);
    }

    [Fact]
    public async Task ExportLowStockIngredientsAsync_ReusesReorderSuggestions()
    {
        // Arrange
        var ingredientService = new Mock<IIngredientService>();
        ingredientService.Setup(s => s.GetReorderSuggestionsAsync()).ReturnsAsync(new List<Ingredient>());

        // Act
        var result = await BuildService(ingredientService).ExportLowStockIngredientsAsync(ExportFormat.Xlsx);

        // Assert — the low-stock rule is sourced once, from the existing service method
        ingredientService.Verify(s => s.GetReorderSuggestionsAsync(), Times.Once);
        Assert.EndsWith(".xlsx", result.FileName);
    }
}
