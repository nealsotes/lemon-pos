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
    public async Task ImportAsync_ProductsReimport_WithoutAddOnsColumn_PreservesExistingAddOnConfig()
    {
        // OT-03: a stale product export carries no add-on columns; re-importing it
        // used to wipe the product's add-on configuration.
        var existing = new Product
        {
            Id = "p1",
            Name = "Milk",
            Category = "Drinks",
            Price = 10m,
            Stock = 5,
            HasAddOns = true,
            AddOnsJson = "[{\"Name\":\"Boba\",\"Price\":15.0}]"
        };
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product> { existing });

        var csv = "Name,Category,Price,Stock\nMilk,Drinks,12,50\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Updated);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p =>
            p.HasAddOns &&
            p.AddOns != null && p.AddOns.Count == 1 &&
            p.AddOns[0].Name == "Boba" && p.AddOns[0].Price == 15m)), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_Products_ExplicitAddOnsColumn_AppliesProvidedValues()
    {
        var existing = new Product
        {
            Id = "p1",
            Name = "Milk",
            Category = "Drinks",
            Price = 10m,
            Stock = 5,
            HasAddOns = false,
            AddOnsJson = "[]"
        };
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product> { existing });

        var csv = "Name,Category,Price,Stock,Add-ons\nMilk,Drinks,12,50,Boba:15; Syrup:5\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Updated);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p =>
            p.HasAddOns &&
            p.AddOns != null && p.AddOns.Count == 2 &&
            p.AddOns[0].Name == "Boba" && p.AddOns[0].Price == 15m &&
            p.AddOns[1].Name == "Syrup" && p.AddOns[1].Price == 5m)), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_Products_AddOnsColumnOnNewRow_CreatesConfiguredAddOns()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "Name,Category,Price,Stock,Add-ons\nCake,Desserts,89.50,12,Boba:15\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Created);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.CreateProductAsync(It.Is<Product>(p =>
            p.HasAddOns && p.AddOns != null && p.AddOns.Count == 1 && p.AddOns[0].Price == 15m)), Times.Once);
    }

    [Fact]
    public async Task ImportAsync_Products_InvalidAddOnsCell_GoesToErrors()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "Name,Category,Price,Stock,Add-ons\nMilk,Drinks,12,50,Boba\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(0, report.Created);
        Assert.Single(report.Errors);
        Assert.Contains("Name:Price", report.Errors[0].Message);
    }

    // LB-003 round-trip pin: both Hot/Cold import semantics in one test.
    // Fixture A — columns absent (an old/stale export): the live row's hot/cold
    // pricing and HasHotCold must survive the import. Fixture B — the standard
    // export layout, where Hot/Cold headers are always present and hot/cold-less
    // products export blank cells: an imported value wins, and a present-but-blank
    // cell is an explicit clear — both cells blanked yields HotPrice/ColdPrice
    // null + HasHotCold=false, while a per-column blank clears only that variant
    // (the mixed case keeps HasHotCold=true, matching the HasValue derivation).
    [Fact]
    public async Task ImportAsync_ProductsReimport_HotColdColumnsAbsentCarryOver_PresentColumnsWinAndBlankCellsClear()
    {
        var existing = new List<Product>
        {
            new() { Id = "p1", Name = "Matcha Latte", Category = "Drinks", Price = 100m, Stock = 8, HotPrice = 65m, ColdPrice = 60m, HasHotCold = true },
            new() { Id = "p2", Name = "Espresso", Category = "Drinks", Price = 50m, Stock = 20, HotPrice = 55m, ColdPrice = 52m, HasHotCold = true },
            new() { Id = "p3", Name = "Iced Tea", Category = "Drinks", Price = 30m, Stock = 15, HotPrice = 40m, ColdPrice = 38m, HasHotCold = true },
            new() { Id = "p4", Name = "Milk Tea", Category = "Drinks", Price = 90m, Stock = 10, HotPrice = 60m, ColdPrice = 55m, HasHotCold = true }
        };
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(existing);

        // Fixture A: no Hot/Cold columns — an old export must not silently drop
        // the live product's hot/cold pricing (the pre-fix bug).
        var staleExportCsv = "Name,Category,Price,Stock\nMatcha Latte,Drinks,95,12\n";
        var reportA = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(staleExportCsv), "system");

        Assert.Equal(1, reportA.Updated);
        Assert.Empty(reportA.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p =>
            p.HotPrice == 65m && p.ColdPrice == 60m && p.HasHotCold)), Times.Once);

        // Fixture B: standard export column layout (headers present; a hot/cold-less
        // product writes blank cells under them).
        var standardExportCsv =
            "Name,Category,Price,Hot Price,Cold Price,Stock,Low Stock Threshold,Status\n" +
            "Espresso,Drinks,50,75,70,20,5,Active\n" +   // imported values win
            "Iced Tea,Drinks,30,,,15,5,Active\n" +       // both blank → explicit full clear
            "Milk Tea,Drinks,90,80,,10,5,Active\n";      // mixed: hot set, cold blank → per-column clear
        var reportB = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(standardExportCsv), "system");

        Assert.Equal(3, reportB.Updated);
        Assert.Empty(reportB.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p2", It.Is<Product>(p =>
            p.HotPrice == 75m && p.ColdPrice == 70m && p.HasHotCold)), Times.Once);
        _productService.Verify(s => s.UpdateProductAsync("p3", It.Is<Product>(p =>
            p.HotPrice == null && p.ColdPrice == null && !p.HasHotCold)), Times.Once);
        _productService.Verify(s => s.UpdateProductAsync("p4", It.Is<Product>(p =>
            p.HotPrice == 80m && p.ColdPrice == null && p.HasHotCold)), Times.Once);
    }

    // ── LB-004: a downloaded standard products export re-imports as-is ──

    private static ExportService CreateExportService(IProductService productService) => new(
        Mock.Of<IReportingService>(),
        Mock.Of<ITransactionRepository>(),
        Mock.Of<IExpenseService>(),
        productService,
        Mock.Of<IIngredientService>());

    private static List<Product> RoundTripCatalog() => new()
    {
        new() { Id = "p1", Name = "Matcha Latte", Category = "Drinks", Price = 100m, Stock = 8, HotPrice = 65m, ColdPrice = 60m, HasHotCold = true },
        new() { Id = "p2", Name = "Espresso", Category = "Drinks", Price = 50m, Stock = 20, HotPrice = 55m, ColdPrice = 52m, HasHotCold = true },
        new() { Id = "p3", Name = "Milk Tea", Category = "Drinks", Price = 90m, Stock = 10, HotPrice = 80m, ColdPrice = null, HasHotCold = true },
        new() { Id = "p4", Name = "Croissant", Category = "Baked Goods", Price = 85m, Stock = 24, HasHotCold = false }
    };

    // The loop the UI actually drives (download the standard products export →
    // upload the picked file untouched), against the REAL ExportService bytes: the
    // banner before the header and the "By Category" summary sheet behind the data
    // (flattened into the CSV stream) must parse as neither records nor errors —
    // pre-fix every row errored "Name is required." and zero products imported.
    [Theory]
    [InlineData(ExportFormat.Csv)]
    [InlineData(ExportFormat.Xlsx)]
    public async Task ImportAsync_RealProductsExportRoundTrip_ImportsEveryRowWithoutSpuriousErrors(ExportFormat format)
    {
        var catalog = RoundTripCatalog();
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(catalog);

        var export = await CreateExportService(_productService.Object).ExportProductsAsync(format);
        var report = await CreateService().ImportAsync(ImportKind.Products, export.FileName, new MemoryStream(export.Content), "system");

        Assert.Equal(0, report.Created);
        Assert.Equal(catalog.Count, report.Updated);
        Assert.Empty(report.Errors);

        // Only the catalog rows upsert — the summary block's per-category rows
        // (which pre-fix produced errors or even mutated a product) contribute nothing.
        _productService.Verify(s => s.UpdateProductAsync(It.IsAny<string>(), It.IsAny<Product>()), Times.Exactly(catalog.Count));
        _productService.Verify(s => s.CreateProductAsync(It.IsAny<Product>()), Times.Never);

        // LB-003 semantics hold in the real export shape too: present columns win,
        // a blank cell clears explicitly (values identical to the seeded catalog).
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p => p.HotPrice == 65m && p.ColdPrice == 60m && p.HasHotCold)), Times.Once);
        _productService.Verify(s => s.UpdateProductAsync("p3", It.Is<Product>(p => p.HotPrice == 80m && p.ColdPrice == null && p.HasHotCold)), Times.Once);
        _productService.Verify(s => s.UpdateProductAsync("p4", It.Is<Product>(p => p.HotPrice == null && p.ColdPrice == null && !p.HasHotCold)), Times.Once);
    }

    [Theory]
    [InlineData(ExportFormat.Csv)]
    [InlineData(ExportFormat.Xlsx)]
    public async Task ImportAsync_RealProductsExportOfEmptyCatalog_ImportsCleanlyWithoutCrash(ExportFormat format)
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var export = await CreateExportService(_productService.Object).ExportProductsAsync(format);
        var report = await CreateService().ImportAsync(ImportKind.Products, export.FileName, new MemoryStream(export.Content), "system");

        Assert.Equal(0, report.Created);
        Assert.Equal(0, report.Updated);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.UpdateProductAsync(It.IsAny<string>(), It.IsAny<Product>()), Times.Never);
        _productService.Verify(s => s.CreateProductAsync(It.IsAny<Product>()), Times.Never);
    }

    // LB-004 no-regression: files without a banner — hand-built CSVs, the LB-003
    // fixture shape — keep importing with the header in the FIRST row.
    [Fact]
    public async Task ImportAsync_BannerlessHeaderFirstCsv_StillImports()
    {
        _productService.Setup(s => s.GetAllProductsAsync())
            .ReturnsAsync(new List<Product> { new() { Id = "p1", Name = "Milk", Category = "Drinks", Price = 10m, Stock = 5 } });

        var csv = "Name,Category,Price,Stock\nMilk,Drinks,12,50\n";
        var report = await CreateService().ImportAsync(ImportKind.Products, "products.csv", ToStream(csv), "system");

        Assert.Equal(1, report.Updated);
        Assert.Empty(report.Errors);
        _productService.Verify(s => s.UpdateProductAsync("p1", It.Is<Product>(p => p.Price == 12m && p.Stock == 50)), Times.Once);
    }

    // A file with no recognizable header at all fails up front with one clear
    // message and zero mutations instead of per-row "Name is required." noise.
    [Fact]
    public async Task ImportAsync_UnrecognizableHeader_ThrowsWithZeroMutations()
    {
        _productService.Setup(s => s.GetAllProductsAsync()).ReturnsAsync(new List<Product>());

        var csv = "some,random,columns\nwith,junk,values\n";
        var ex = await Assert.ThrowsAsync<ArgumentException>(() =>
            CreateService().ImportAsync(ImportKind.Products, "junk.csv", ToStream(csv), "system"));

        Assert.Contains("header row", ex.Message);
        _productService.Verify(s => s.UpdateProductAsync(It.IsAny<string>(), It.IsAny<Product>()), Times.Never);
        _productService.Verify(s => s.CreateProductAsync(It.IsAny<Product>()), Times.Never);
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