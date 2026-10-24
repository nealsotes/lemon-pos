using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

// Bulk import from CSV/XLSX. Columns mirror the matching ExportService sheets, so
// an export can be edited and re-imported round-trip:
//   Products    — Name, Category, Price, Hot Price, Cold Price, Stock, Low Stock Threshold, Status
//   Ingredients — Name, Quantity, Unit, Unit Cost, Supplier, Low Stock Threshold, Expiration,
//                 Last Purchase, Last Purchase Cost, Status
//   Expenses    — Date, Category, Description, Amount, Recurring, Recurrence, Notes
// Headers are matched case-insensitively with punctuation stripped; unknown columns
// (Total Value, Created, ...) are ignored. Products/ingredients upsert by name
// (case-insensitive, never an exact-case lookup, so a re-import never creates
// accidental duplicates through casing alone); expenses always insert because they
// are ledger entries, and unknown category names are auto-created.
// Per-row validation failures are collected into the report instead of aborting the
// whole file: a bad row 7 shouldn't hide the 50 valid rows around it.
public class ImportService : IImportService
{
    private readonly IProductService _productService;
    private readonly IIngredientService _ingredientService;
    private readonly IExpenseService _expenseService;
    private readonly IExpenseCategoryRepository _expenseCategoryRepository;

    public ImportService(
        IProductService productService,
        IIngredientService ingredientService,
        IExpenseService expenseService,
        IExpenseCategoryRepository expenseCategoryRepository)
    {
        _productService = productService;
        _ingredientService = ingredientService;
        _expenseService = expenseService;
        _expenseCategoryRepository = expenseCategoryRepository;
    }

    // ── Template workbook: the same columns ImportAsync reads, with one obvious
    // placeholder row (clearly marked to be replaced) so users can see the expected
    // format before filling it in. ──

    public byte[] GetTemplateWorkbook(ImportKind kind)
    {
        var (sheetName, headers, example) = GetTemplateShape(kind);

        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add(sheetName);
        for (var c = 0; c < headers.Length; c++)
        {
            ws.Cell(1, c + 1).Value = headers[c];
            ws.Cell(1, c + 1).Style.Font.Bold = true;
        }
        for (var c = 0; c < example.Length; c++)
        {
            ws.Cell(2, c + 1).Value = example[c];
        }
        ws.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    private static (string sheetName, string[] headers, string[] example) GetTemplateShape(ImportKind kind) => kind switch
    {
        ImportKind.Products => (
            "Products",
            new[] { "Name", "Category", "Price", "Hot Price", "Cold Price", "Stock", "Low Stock Threshold", "Status" },
            new[] { "Sample Product (replace)", "Drinks", "85", "", "", "50", "10", "Active" }),
        ImportKind.Ingredients => (
            "Ingredients",
            new[] { "Name", "Quantity", "Unit", "Unit Cost", "Supplier", "Low Stock Threshold", "Expiration", "Last Purchase", "Last Purchase Cost", "Status" },
            new[] { "Sample Ingredient (replace)", "5", "kg", "42.50", "Supplier Co", "3", "", "", "", "Active" }),
        ImportKind.Expenses => (
            "Expenses",
            new[] { "Date", "Category", "Description", "Amount", "Recurring", "Recurrence", "Notes" },
            new[] { "2026-10-24", "Utilities", "Sample expense (replace)", "320.50", "No", "", "" }),
        _ => throw new ArgumentException("Unknown import kind.")
    };

    public async Task<ImportResultReport> ImportAsync(ImportKind kind, string fileName, Stream stream, string userId)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name is required.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension != ".csv" && extension != ".xlsx")
            throw new ArgumentException("Unsupported file type. Upload a .csv or .xlsx file.");

        // Grid = every row including the header; each data row becomes a dict keyed by
        // normalized header so column order never matters.
        var grid = extension == ".xlsx" ? ParseXlsxGrid(stream) : ParseCsvGrid(stream);
        if (grid.Count == 0)
            throw new ArgumentException("The file has no readable rows.");

        var header = grid[0];
        var dataRows = grid.Skip(1).Select(values => ToRow(values, header));
        if (!dataRows.Any())
            throw new ArgumentException("No data rows found below the header row. Keep the header row in place.");

        var report = new ImportResultReport { Kind = kind.ToString() };

        switch (kind)
        {
            case ImportKind.Products:
                await ImportProductsAsync(dataRows, report);
                break;
            case ImportKind.Ingredients:
                await ImportIngredientsAsync(dataRows, report);
                break;
            case ImportKind.Expenses:
                await ImportExpensesAsync(dataRows, report, userId);
                break;
        }

        return report;
    }

    // ── Grid parsing (xlsx via ClosedXML, RFC-4180-style CSV by hand) ──

    private static List<List<string>> ParseXlsxGrid(Stream stream)
    {
        using var workbook = new XLWorkbook(stream);
        var worksheet = workbook.Worksheets.FirstOrDefault()
            ?? throw new ArgumentException("The workbook contains no sheets.");
        var used = worksheet.RangeUsed();
        if (used == null) return new List<List<string>>();

        var rows = new List<List<string>>();
        foreach (var row in used.Rows())
        {
            var values = new List<string>();
            foreach (var cell in row.Cells())
            {
                values.Add(cell.DataType switch
                {
                    XLDataType.DateTime => cell.GetDateTime().ToString("yyyy-MM-dd"),
                    XLDataType.Number => cell.GetDouble().ToString(CultureInfo.InvariantCulture),
                    _ => cell.GetString() ?? string.Empty
                });
            }
            rows.Add(values);
        }
        return rows;
    }

    private static List<List<string>> ParseCsvGrid(Stream stream)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        var c = reader.Read();
        while (c != -1)
        {
            var ch = (char)c;
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (reader.Peek() == '"') { reader.Read(); field.Append('"'); }
                    else inQuotes = false;
                }
                else field.Append(ch);
            }
            else if (ch == '"') inQuotes = true;
            else if (ch == ',') { row.Add(field.ToString()); field.Clear(); }
            else if (ch == '\n' || ch == '\r')
            {
                if (ch == '\r' && reader.Peek() == '\n') reader.Read();
                row.Add(field.ToString()); field.Clear();
                rows.Add(row); row = new List<string>();
            }
            else field.Append(ch);
            c = reader.Read();
        }
        if (field.Length > 0 || row.Count > 0) { row.Add(field.ToString()); rows.Add(row); }

        return rows;
    }

    private static IReadOnlyDictionary<string, string> ToRow(List<string> values, List<string> header)
    {
        var row = new Dictionary<string, string>();
        for (var c = 0; c < header.Count && c < values.Count; c++)
        {
            var key = NormalizeHeader(header[c]);
            if (key.Length == 0 || row.ContainsKey(key)) continue;
            row[key] = values[c];
        }
        return row;
    }

    private static string NormalizeHeader(string header) =>
        new string(header.Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    // First matching synonym wins: export headers and hand-edited Excel headers
    // ("Qty", "On Hand", "Quantity") must all map to the same field.
    private static string GetValue(IReadOnlyDictionary<string, string> row, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (row.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }
        return string.Empty;
    }

    // ── Products ──

    private async Task ImportProductsAsync(IEnumerable<IReadOnlyDictionary<string, string>> rows, ImportResultReport report)
    {
        // Upsert by case-insensitive name: an exact-case lookup would treat "milk"
        // and "Milk" as different products and create duplicates on re-import.
        var existing = (await _productService.GetAllProductsAsync()).ToList();
        var byName = new Dictionary<string, Product>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in existing)
        {
            if (!string.IsNullOrWhiteSpace(p.Name)) byName[p.Name.Trim()] = p;
        }

        var ordinal = 0;
        foreach (var row in rows)
        {
            ordinal++;
            if (IsBlankOrTotalRow(row, "name")) { report.Skipped++; continue; }

            try
            {
                var name = GetValue(row, "name", "productname", "product");
                if (string.IsNullOrWhiteSpace(name))
                    throw new ArgumentException("Name is required.");

                if (!byName.TryGetValue(name, out var existingProduct))
                    existingProduct = null;

                var price = ParseDecimal(GetValue(row, "price", "unitprice", "sellingprice"), "Price", canBeZero: true);
                if (price < 0)
                    throw new ArgumentException("Price cannot be negative.");

                var stock = ParseInt(GetValue(row, "stock", "quantity", "qty", "onhand"));
                if (stock < 0)
                    throw new ArgumentException("Stock cannot be negative.");

                var hotPrice = ParseOptionalDecimal(GetValue(row, "hotprice", "hot"));
                var coldPrice = ParseOptionalDecimal(GetValue(row, "coldprice", "cold"));

                var product = new Product
                {
                    Name = name,
                    Category = string.IsNullOrWhiteSpace(GetValue(row, "category"))
                        ? "Uncategorized"
                        : GetValue(row, "category"),
                    Price = price,
                    HotPrice = hotPrice,
                    ColdPrice = coldPrice,
                    Stock = stock,
                    LowQuantityThreshold = ParseOptionalInt(GetValue(row, "lowstockthreshold", "lowquantitythreshold", "threshold"))
                        ?? existingProduct?.LowQuantityThreshold ?? 10,
                    Image = existingProduct?.Image ?? string.Empty,
                    CreatedAt = existingProduct?.CreatedAt ?? DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    IsActive = ParseStatus(GetValue(row, "status"), existingProduct?.IsActive ?? true),
                    HasHotCold = hotPrice.HasValue || coldPrice.HasValue
                };

                if (existingProduct != null)
                {
                    product.Id = existingProduct.Id;
                    await _productService.UpdateProductAsync(existingProduct.Id, product);
                    report.Updated++;
                }
                else
                {
                    await _productService.CreateProductAsync(product);
                    byName[product.Name] = product;
                    report.Created++;
                }
            }
            catch (ArgumentException ex)
            {
                report.Errors.Add(new ImportRowError { Row = ordinal, Message = ex.Message });
            }
        }
    }

    // ── Ingredients ──

    private async Task ImportIngredientsAsync(IEnumerable<IReadOnlyDictionary<string, string>> rows, ImportResultReport report)
    {
        var existing = (await _ingredientService.GetAllIngredientsAsync()).ToList();
        var byName = new Dictionary<string, Ingredient>(StringComparer.OrdinalIgnoreCase);
        foreach (var i in existing)
        {
            if (!string.IsNullOrWhiteSpace(i.Name)) byName[i.Name.Trim()] = i;
        }

        var ordinal = 0;
        foreach (var row in rows)
        {
            ordinal++;
            if (IsBlankOrTotalRow(row, "name")) { report.Skipped++; continue; }

            try
            {
                var name = GetValue(row, "name", "ingredientname", "ingredient");
                if (string.IsNullOrWhiteSpace(name))
                    throw new ArgumentException("Name is required.");

                if (!byName.TryGetValue(name, out var existingIngredient))
                    existingIngredient = null;

                var quantity = ParseDecimal(GetValue(row, "quantity", "stock", "qty", "onhand"), "Quantity", canBeZero: true);
                if (quantity < 0)
                    throw new ArgumentException("Quantity cannot be negative.");

                var unit = GetValue(row, "unit");
                if (string.IsNullOrWhiteSpace(unit))
                    unit = "pieces";

                var dto = new IngredientDto
                {
                    Name = name,
                    Quantity = quantity,
                    Unit = unit,
                    Supplier = string.IsNullOrWhiteSpace(GetValue(row, "supplier")) ? null : GetValue(row, "supplier"),
                    ExpirationDate = ParseOptionalDate(GetValue(row, "expirationdate", "expiration", "expiry")),
                    LowStockThreshold = ParseDecimal(GetValue(row, "lowstockthreshold", "lowstock", "threshold"), "Low Stock Threshold", canBeZero: true),
                    UnitCost = ParseOptionalDecimal(GetValue(row, "unitcost", "cost")),
                    LastPurchaseDate = ParseOptionalDate(GetValue(row, "lastpurchasedate", "lastpurchase")),
                    LastPurchaseCost = ParseOptionalDecimal(GetValue(row, "lastpurchasecost")),
                    IsActive = ParseStatus(GetValue(row, "status"), existingIngredient?.IsActive ?? true)
                };

                if (existingIngredient != null)
                {
                    await _ingredientService.UpdateIngredientAsync(existingIngredient.Id, dto);
                    report.Updated++;
                }
                else
                {
                    await _ingredientService.CreateIngredientAsync(dto);
                    // Second occurrence in the same file should still update, not duplicate.
                    byName[dto.Name] = new Ingredient { Id = "pending", Name = dto.Name };
                    report.Created++;
                }
            }
            catch (ArgumentException ex)
            {
                report.Errors.Add(new ImportRowError { Row = ordinal, Message = ex.Message });
            }
        }
    }

    // ── Expenses ──

    private async Task ImportExpensesAsync(IEnumerable<IReadOnlyDictionary<string, string>> rows, ImportResultReport report, string userId)
    {
        // Expenses are ledger entries: always insert (no upsert), and the importing
        // user becomes CreatedBy — the file's "Created By" column is informational.
        // Unknown category names are auto-created because exports carry names, not ids.
        var categories = (await _expenseCategoryRepository.GetAllActiveAsync()).ToList();
        var categoryByName = new Dictionary<string, ExpenseCategory>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in categories)
        {
            if (!string.IsNullOrWhiteSpace(c.Name)) categoryByName[c.Name.Trim()] = c;
        }

        var ordinal = 0;
        foreach (var row in rows)
        {
            ordinal++;
            if (IsBlankOrTotalRow(row, "date", "description")) { report.Skipped++; continue; }

            try
            {
                var description = GetValue(row, "description", "item");
                if (string.IsNullOrWhiteSpace(description))
                    throw new ArgumentException("Description is required.");

                var categoryName = GetValue(row, "category", "categoryname");
                if (string.IsNullOrWhiteSpace(categoryName))
                    throw new ArgumentException("Category is required.");

                var amount = ParseDecimal(GetValue(row, "amount"), "Amount", canBeZero: true);
                if (amount <= 0)
                    throw new ArgumentException("Amount must be greater than 0.");

                var date = ParseDate(GetValue(row, "date", "expensedate"));

                if (!categoryByName.TryGetValue(categoryName, out var category))
                {
                    var maxSortOrder = categoryByName.Values.Any() ? categoryByName.Values.Max(c => c.SortOrder) : 0;
                    category = new ExpenseCategory
                    {
                        Id = Guid.NewGuid().ToString(),
                        Name = categoryName,
                        IsSystem = false,
                        IsActive = true,
                        SortOrder = maxSortOrder + 1
                    };
                    await _expenseCategoryRepository.AddAsync(category);
                    categoryByName[category.Name.Trim()] = category;
                }

                var isRecurring = ParseBool(GetValue(row, "recurring", "isrecurring"));
                var recurrenceType = string.IsNullOrWhiteSpace(GetValue(row, "recurrence", "recurrencetype", "recurringtype"))
                    ? null
                    : GetValue(row, "recurrence", "recurrencetype", "recurringtype").ToLowerInvariant();
                if (isRecurring && string.IsNullOrWhiteSpace(recurrenceType))
                    throw new ArgumentException("Recurrence is required for recurring expenses.");
                if (isRecurring && recurrenceType != "monthly" && recurrenceType != "weekly" && recurrenceType != "yearly")
                    throw new ArgumentException("Recurrence must be monthly, weekly or yearly.");
                if (!isRecurring) recurrenceType = null;

                var dto = new ExpenseDto
                {
                    CategoryId = category.Id,
                    Description = description,
                    Amount = amount,
                    Date = date,
                    IsRecurring = isRecurring,
                    RecurrenceType = recurrenceType,
                    RecurrenceEndDate = null,
                    Notes = string.IsNullOrWhiteSpace(GetValue(row, "notes")) ? null : GetValue(row, "notes")
                };

                await _expenseService.CreateExpenseAsync(dto, string.IsNullOrWhiteSpace(userId) ? "system" : userId);
                report.Created++;
            }
            catch (ArgumentException ex)
            {
                report.Errors.Add(new ImportRowError { Row = ordinal, Message = ex.Message });
            }
        }
    }

    // ── Row helpers ──

    // Exported ingredient/expense sheets end with a "Total" summary row, and exports
    // can carry blank spacer rows; both are padding, not data, so re-importing an
    // edited export must not read them as records.
    private static bool IsBlankOrTotalRow(IReadOnlyDictionary<string, string> row, params string[] firstColumnKeys)
    {
        if (row.Values.All(string.IsNullOrWhiteSpace)) return true;

        foreach (var key in firstColumnKeys)
        {
            if (row.TryGetValue(key, out var value) && value.Trim().Equals("total", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    // ── Value parsers (shared by all import kinds) ──

    private static decimal ParseDecimal(string raw, string label, bool canBeZero)
    {
        var text = raw.Replace("₱", string.Empty).Replace("$", string.Empty).Replace(",", string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException($"{label} is required.");
        if (!decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var value))
            throw new ArgumentException($"'{raw}' is not a valid number for {label}.");
        if (!canBeZero && value == 0)
            throw new ArgumentException($"{label} must be greater than 0.");
        return value;
    }

    private static decimal? ParseOptionalDecimal(string raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : ParseDecimal(raw, "Value", canBeZero: true);

    private static int ParseInt(string raw)
    {
        var text = raw.Replace(",", string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text)) return 0;
        if (!int.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var value))
            throw new ArgumentException($"'{raw}' is not a valid whole number.");
        return value;
    }

    private static int? ParseOptionalInt(string raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : ParseInt(raw);

    // Accepts exported yyyy-MM-dd plus common spreadsheet-entry formats.
    private static DateTime ParseDate(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            throw new ArgumentException("Date is required.");
        var formats = new[] { "yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy", "MM/dd/yyyy HH:mm:ss", "M/d/yy", "dd MMM yyyy", "MMMM d, yyyy" };
        if (DateTime.TryParseExact(raw.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var value)
            || DateTime.TryParse(raw.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value))
            return value;
        throw new ArgumentException($"'{raw}' is not a valid date. Use yyyy-MM-dd.");
    }

    private static DateTime? ParseOptionalDate(string raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : ParseDate(raw);

    private static bool ParseBool(string raw) =>
        raw.Equals("yes", StringComparison.OrdinalIgnoreCase)
        || raw.Equals("y", StringComparison.OrdinalIgnoreCase)
        || raw.Equals("true", StringComparison.OrdinalIgnoreCase)
        || raw.Equals("1", StringComparison.OrdinalIgnoreCase);

    private static bool ParseStatus(string raw, bool current)
    {
        if (string.IsNullOrWhiteSpace(raw)) return current;
        return raw.StartsWith("in", StringComparison.OrdinalIgnoreCase) ? false : true;
    }
}