using ClosedXML.Excel;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;
using System.Text;
using Xunit;

namespace PosSystem.Tests;

public class ImportServiceTests
{
    private readonly Mock<IProductService> _productService = new();
    private readonly Mock<IIngredientService> _ingredientService = new();
    private readonly Mock<IExpenseService> _expenseService = new();
    private readonly Mock<IExpenseCategoryRepository> _expenseCategoryRepository = new();

    private ImportService CreateService() => new(
        _productService.Object,
        _ingredientService.Object,
        _expenseService.Object,
        _expenseCategoryRepository.Object);

    private static MemoryStream ToStream(string csv) => new(Encoding.UTF8.GetBytes(csv));

    private static MemoryStream ToXlsx(string sheetName, params string[][] rows)
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add(sheetName);
        for (var r = 0; r < rows.Length; r++)
            for (var c = 0; c < rows[r].Length; c++)
                ws.Cell(r + 1, c + 1).Value = rows[r][c];
        var ms = new MemoryStream();
        workbook.SaveAs(ms);
        ms.Position = 0;
        return ms;
    }

    // ── Products ──

    [Fact]
    public Task ImportAsync_ProductsMixedNewAndKnown_CreatesNewUpdatesKnown()
    {
        _productService.Setup(s => s.GetAllProductsAsync())
            .ReturnsAsync(new List<Product> { new() { Id = "p1", Name = "Milk", Category = "Drinks", Price = 10m, Stock = 5 } });

        var csv = "Name,Category,Price,Stock\nMilk,Drinks,12,50\nCake,Desserts,89.50,12\n";

        var report = CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system").Result;

        Assert.Equal(1, report.Created);
        Assert.Equal(1, report.Updated);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p => p.Price == 12m && p.Stock == 50)), Times.Once);
        _productService.Verify(s => s.CreateProductAsync(It.Is<Product>(p => p.Name == "Cake" && p.Price == 89.50m)), Times.Once);
        _productService.Verify(s => s.GetAllProductsAsync(), Times.Once);
        return Task.CompletedTask;
    }

    [Fact]
    public Task ImportAsync_ProductsNameCasingVariant_UpdatesInsteadOfDuplicate()
    {
        _productService.Setup(s => s.GetAllProductsAsync())
            .ReturnsAsync(new List<Product> { new() { Id = "p1", Name = "Milk", Category = "Drinks", Price = 10m, Stock = 5 } });

        var csv = "Name,Category,Price\nMILK,Drinks,15\n";

        var report = CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system").Result;

        Assert.Equal(0, report.Created);
        Assert.Equal(1, report.Updated);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p => p.Name == "MILK")), Times.Once);
        return Task.CompletedTask;
    }

    [Fact]
    public Task ImportAsync_ProductsMissingName_GoesToErrorsAndValidRowsStillImport()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "Name,Category,Price\n,Drinks,10\nIced Tea,Drinks,35\n";

        var report = CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system").Result;

        Assert.Equal(1, report.Created);
        Assert.Single(report.Errors);
        Assert.Contains("Name", report.Errors[0].Message);
        return Task.CompletedTask;
    }

    [Fact]
    public async Task ImportAsync_ProductsBadPrice_GoesToErrors()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "Name,Category,Price\nMilk,Drinks,ten\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(0, report.Created);
        Assert.Single(report.Errors);
        Assert.Contains("valid number", report.Errors[0].Message);
    }

    [Fact]
    public async Task ImportAsync_ProductsXlsxFromExportLayout_RoundTrips()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        using var xlsx = ToXlsx("Products",
            new[] { "Name", "Category", "Price", "Hot Price", "Cold Price", "Stock", "Low Stock Threshold", "Status" },
            new[] { "Coffee", "Drinks", "45", "50", "48", "100", "20", "Active" });
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.xlsx", xlsx, "system");

        Assert.Equal(1, report.Created);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.CreateProductAsync(It.Is<Product>(p =>
            p.Name == "Coffee" && p.Price == 45m && p.HotPrice == 50m && p.ColdPrice == 48m && p.HasHotCold)), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_UnsupportedFileType_Throws()
    {
        await Assert.ThrowsAsync<ArgumentException>(() =>
            CreateService().ImportAsync(ImportKind.Products, "products.pdf", new MemoryStream(new byte[] { 1 }), "system"));
    }

    // ── Ingredients ──

    [Fact]
    public async Task ImportAsync_IngredientsNewAndKnown_UsesUpserts()
    {
        _ingredientService.Setup(s => s.GetAllIngredientsAsync())
            .ReturnsAsync(new List<Ingredient> { new() { Id = "i1", Name = "Sugar", Quantity = 3, Unit = "kg", LowStockThreshold = 5 } });

        var csv = "Name,Quantity,Unit,Unit Cost,Supplier,Low Stock Threshold\nSugar,10,kg,45.5,Supplier One,2\nFlour,5,kg,30,,3\n";
        var report = await CreateService().ImportAsync(ImportKind.Ingredients, "ingredients.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Created);
        Assert.Equal(1, report.Updated);
        _ingredientService.Verify(s => s.UpdateIngredientAsync("i1", It.Is<IngredientDto>(d => d.Quantity == 10m && d.UnitCost == 45.5m)), Times.Once);
        _ingredientService.Verify(s => s.CreateIngredientAsync(It.Is<IngredientDto>(d => d.Name == "Flour" && d.Unit == "kg" && d.Supplier == null)), Times.Once);
    }

    // ── Expenses ──

    [Fact]
    public async Task ImportAsync_ExpensesKnownAndUnknownCategories_ResolvesAndAutoCreates()
    {
        _expenseCategoryRepository.Setup(r => r.GetAllActiveAsync())
            .ReturnsAsync(new List<ExpenseCategory> { new() { Id = "c1", Name = "Utilities", SortOrder = 1 } });
        _expenseCategoryRepository.Setup(r => r.AddAsync(It.IsAny<ExpenseCategory>()))
            .ReturnsAsync((ExpenseCategory c) => c);

        var csv = "Date,Category,Description,Amount\n2026-10-01,Utilities,Electric bill,2500.25\n2026-10-05,Marketing,Flyer batch,800\n";
        var report = await CreateService().ImportAsync(ImportKind.Expenses, "expenses.csv", ToStream(csv), "user-9");

        Assert.Equal(2, report.Created);
        Assert.Empty(report.Errors);
        // Utilities resolves against the existing category id; Marketing is auto-created.
        _expenseService.Verify(s => s.CreateExpenseAsync(It.Is<ExpenseDto>(d => d.CategoryId == "c1" && d.Amount == 2500.25m), "user-9"), Times.Once);
        _expenseService.Verify(s => s.CreateExpenseAsync(It.Is<ExpenseDto>(d => d.Amount == 800m), "user-9"), Times.Once);
        _expenseCategoryRepository.Verify(r => r.AddAsync(It.Is<ExpenseCategory>(c => c.Name == "Marketing" && c.IsActive)), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_ExpensesRecurringWithoutType_GoesToErrors()
    {
        _expenseCategoryRepository.Setup(r => r.GetAllActiveAsync())
            .ReturnsAsync(new List<ExpenseCategory> { new() { Id = "c1", Name = "Rent" } });

        var csv = "Date,Category,Description,Amount,Recurring\n2026-10-01,Rent,Monthly rent,10000,Yes\n2026-10-02,Office,Chairs,500,No\n";
        var report = await CreateService().ImportAsync(ImportKind.Expenses, "expenses.csv", ToStream(csv), "user-9");

        Assert.Equal(1, report.Created);
        Assert.Single(report.Errors);
        Assert.Contains("Recurrence", report.Errors[0].Message);
    }

    // Exported expense sheets end with a Total row — padding, never an expense.
    [Fact]
    public async Task ImportAsync_ExpendsWithTotalRow_SkipsTheTotalRow()
    {
        _expenseCategoryRepository.Setup(r => r.GetAllActiveAsync())
            .ReturnsAsync(new List<ExpenseCategory> { new() { Id = "c1", Name = "Utilities" } });

        var csv = "Date,Category,Description,Amount\n2026-10-01,Utilities,Water bill,320\nTotal,,,\n";
        var report = await CreateService().ImportAsync(ImportKind.Expenses, "expenses.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Created);
        Assert.Equal(1, report.Skipped);
        Assert.Empty(report.Errors);
    }

    // ── Templates ──

    [Fact]
    public async Task GetTemplateWorkbook_Products_ReturnsXlsxWithImportHeadersAndExampleRow()
    {
        var bytes = CreateService().GetTemplateWorkbook(ImportKind.Products);

        using var workbook = new XLWorkbook(new MemoryStream(bytes));
        var ws = workbook.Worksheets.First();
        Assert.Equal("Name", ws.Cell(1, 1).GetString());
        Assert.Equal("Status", ws.Cell(1, 8).GetString());
        Assert.Contains("Sample Product", ws.Cell(2, 1).GetString());
        // Header + exactly one example row — templates must arrive clean, not half-filled.
        Assert.Equal(2, ws.RowsUsed().Count());

        // And the template itself must round-trip through the importer once filled.
        using var filled = new XLWorkbook(new MemoryStream(bytes));
        filled.Worksheets.First().Cell(2, 1).Value = "Template Roundtrip Coffee";
        var ms = new MemoryStream();
        filled.SaveAs(ms);
        ms.Position = 0;
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());
        var report = await CreateService().ImportAsync(ImportKind.Products, "t.xlsx", ms, "system");
        Assert.Equal(1, report.Created);
    }

    // ── CSV plumbing ──

    [Fact]
    public async Task ImportAsync_QuotedCsvFieldWithCommas_ParsesFieldIntact()
    {
        _expenseCategoryRepository.Setup(r => r.GetAllActiveAsync())
            .ReturnsAsync(new List<ExpenseCategory> { new() { Id = "c1", Name = "Supplies" } });

        var csv = "Date,Category,Description,Amount\n2026-10-01,Supplies,\"Paper, cups, and lids\",123.50\n";
        var report = await CreateService().ImportAsync(ImportKind.Expenses, "expenses.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Created);
        _expenseService.Verify(s => s.CreateExpenseAsync(It.Is<ExpenseDto>(d => d.Description == "Paper, cups, and lids"), It.IsAny<string>()), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_CurrencySymbolsAndThousandsSeparators_ParseAsNumbers()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "Name,Category,Price\nBuko Juice,Drinks,\"₱1,250.50\"\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Created);
        _productService.Verify(s => s.CreateProductAsync(It.Is<Product>(p => p.Price == 1250.50m)), Times.Once);
    }
}