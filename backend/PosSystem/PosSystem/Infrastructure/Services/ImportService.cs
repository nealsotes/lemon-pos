using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

// Bulk import from CSV/XLSX. Columns mirror the matching ExportService sheets, so
// an export can be edited and re-imported round-trip:
//   Products    — Name, Category, Price, Hot Price, Cold Price, Stock, Low Stock Threshold, Status
//                 (Hot/Cold columns: when a column is absent the updated product
//                  keeps its existing price — a re-import of a stale export must
//                  not silently drop hot/cold pricing, LB-003; when a column is
//                  present it wins — a value imports and a blank cell is an
//                  explicit clear, matching what the export writes for
//                  hot/cold-less products)
//                 (+ optional non-standard "Add-ons" column: "Name:Price" pairs separated by ';';
//                  when the column is absent, an updated product keeps its existing add-on
//                  configuration — a re-import of a stale export must not wipe it, OT-03)
//   Ingredients — Name, Quantity, Unit, Unit Cost, Supplier, Low Stock Threshold, Expiration,
//                 Last Purchase, Last Purchase Cost, Status
//   Expenses    — Date, Category, Description, Amount, Recurring, Recurrence, Notes
// Standard exports open with a banner (title row, "Generated: … UTC", a blank
// spacer) BEFORE the column header and can carry summary sheets ("By Category")
// behind the data, so the real header row is found by content — not assumed to be
// grid[0] — and data rows stop at section markers (LB-004): downloaded export
// files re-import as-is.
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

        // LB-004: the standard exports open with a banner BEFORE the real column
        // header — a title row, a "Generated: … UTC" line and a blank spacer — and,
        // flattened to CSV, the "By Category" summary sheet after the data rows.
        // Treating grid[0] as THE header parsed every real export record under the
        // title cell's one-column header, so a downloaded file re-imported as-is
        // reported "Name is required." per row and imported zero products. Find the
        // real header row by content instead; a banner-less hand-built file whose
        // first row IS the header still matches (at index 0).
        if (FindHeaderRowIndex(grid, kind) is not { } headerIndex)
            throw new ArgumentException(
                "Could not find a recognized column header row. Re-export the file from the app or use the import template.");

        var header = grid[headerIndex];

        // Data records run to the workbook's next section marker ("BY CATEGORY"), so
        // CSV exports' appended summary sheets parse as neither records nor errors;
        // a zero-row file (an export of an empty catalog) simply imports nothing.
        var dataRows = grid.Skip(headerIndex + 1)
            .TakeWhile(row => !IsSectionMarkerRow(row))
            .Select(values => ToRow(values, header))
            .ToList();

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

    // ── Header detection + section markers (LB-004) ──
    //
    // Standard exports open with a banner BEFORE the real header (title row,
    // "Generated: … UTC", a blank spacer), and CSV exports stamp the sheet name as a
    // single-cell record between sheets while appending summary sheets ("By
    // Category") behind the data. Detection keys on content, not position:
    // a header row's leading cell is the kind's primary column ("Name"/"Date")
    // followed by at least one more recognized column — or is a lone primary cell
    // (a degenerate one-column file keeps importing) — while a marker row is a
    // single cell naming one of the exporter's sheets, so the data records run only
    // until the first marker and appended summary sheets parse as neither records
    // nor errors.

    private static int? FindHeaderRowIndex(List<List<string>> grid, ImportKind kind)
    {
        var (leadSynonyms, vocabulary) = kind switch
        {
            ImportKind.Products => (PrimaryColumnLeads.Products, KnownColumnNames.Products),
            ImportKind.Ingredients => (PrimaryColumnLeads.Ingredients, KnownColumnNames.Ingredients),
            ImportKind.Expenses => (PrimaryColumnLeads.Expenses, KnownColumnNames.Expenses),
            _ => (new HashSet<string>(), new HashSet<string>())
        };

        for (var r = 0; r < grid.Count; r++)
        {
            if (IsHeaderRow(grid[r], leadSynonyms, vocabulary)) return r;
        }

        return null;
    }

    private static bool IsHeaderRow(List<string> cells, HashSet<string> leadSynonyms, HashSet<string> vocabulary)
    {
        var nonEmpty = cells.Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
        if (nonEmpty.Count == 0 || !leadSynonyms.Contains(NormalizeHeader(nonEmpty[0])))
            return false;
        if (nonEmpty.Count == 1)
            return true;

        // At least two recognized columns AND at least half the row recognizable:
        // foreign sheets' headers (a full-report dump parsed against the wrong kind)
        // may also open with "Name" but share too few columns with this kind to pass.
        var recognized = nonEmpty.Count(v => vocabulary.Contains(NormalizeHeader(v)));
        return recognized >= 2 && recognized * 2 >= nonEmpty.Count;
    }

    private static bool IsSectionMarkerRow(List<string> row)
    {
        var nonEmpty = row.Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
        return nonEmpty.Count == 1 && ExportSheetMarkerNames.Contains(NormalizeHeader(nonEmpty[0]));
    }

    // Every sheet name ExportService stamps between CSV sheets ("PRODUCTS", "BY
    // CATEGORY", …), pre-normalized the way data headers are. A single-cell record
    // naming a sheet ends the preceding sheet's data records; "Total" summary rows
    // and blank spacers keep flowing through IsBlankOrTotalRow instead — only
    // section breaks cut here.
    private static readonly HashSet<string> ExportSheetMarkerNames = new(StringComparer.Ordinal)
    {
        "products", "bycategory", "ingredients", "lowstock", "expenses", "expensesbycategory",
        "transactions", "lineitems", "topproducts", "salesbycategory", "plsummary",
        "periodbreakdown", "valuation", "topingredients", "movements", "consumption",
        "suppliers", "summary"
    };

    // Primary-column lead cells per kind, plus every header name the kind
    // legitimately writes or reads, INCLUDING the informational columns imports
    // skip (Created, Updated, Total Value) so real export header rows still match.
    private static class PrimaryColumnLeads
    {
        public static readonly HashSet<string> Products = new(StringComparer.Ordinal) { "name", "productname", "product" };
        public static readonly HashSet<string> Ingredients = new(StringComparer.Ordinal) { "name", "ingredientname", "ingredient" };
        public static readonly HashSet<string> Expenses = new(StringComparer.Ordinal) { "date", "expensedate" };
    }

    private static class KnownColumnNames
    {
        public static readonly HashSet<string> Products = new(StringComparer.Ordinal)
        {
            "name", "productname", "product", "category", "price", "unitprice", "sellingprice",
            "hotprice", "hot", "coldprice", "cold", "stock", "quantity", "qty", "onhand",
            "lowstockthreshold", "lowquantitythreshold", "threshold", "status", "addons", "addon",
            "created", "updated"
        };

        public static readonly HashSet<string> Ingredients = new(StringComparer.Ordinal)
        {
            "name", "ingredientname", "ingredient", "quantity", "stock", "qty", "onhand", "unit",
            "unitcost", "totalvalue", "supplier", "lowstockthreshold", "lowstock", "threshold",
            "expiration", "expirationdate", "expiry", "lastpurchase", "lastpurchasedate",
            "lastpurchasecost", "status"
        };

        public static readonly HashSet<string> Expenses = new(StringComparer.Ordinal)
        {
            "date", "expensedate", "category", "categoryname", "description", "item", "amount",
            "recurring", "isrecurring", "recurrence", "recurrencetype", "recurringtype", "notes",
            "createdby"
        };
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

                // LB-003: distinguish "column absent" from "column present". A CSV
                // without Hot/Cold headers (e.g. an old export) must carry the live
                // row's hot/cold pricing over — UpdateProductAsync assigns
                // HotPrice/ColdPrice/HasHotCold unconditionally, so a fresh valueless
                // row used to silently blank them. A PRESENT column wins: an
                // imported value imports, and a blank cell is an explicit clear
                // (HotPrice null), matching the plain ParseOptionalDecimal read.
                // ToRow stores an entry per populated header, so ContainsKey is the
                // presence check, same synonyms GetValue matches.
                var hasHotColumn = row.ContainsKey("hotprice") || row.ContainsKey("hot");
                var hasColdColumn = row.ContainsKey("coldprice") || row.ContainsKey("cold");
                var hotPrice = hasHotColumn
                    ? ParseOptionalDecimal(GetValue(row, "hotprice", "hot"))
                    : existingProduct?.HotPrice;
                var coldPrice = hasColdColumn
                    ? ParseOptionalDecimal(GetValue(row, "coldprice", "cold"))
                    : existingProduct?.ColdPrice;

                // OT-03: add-ons are not part of the standard export columns. A
                // re-import of a stale export must carry the live row's add-on
                // configuration over (ProductService.UpdateProductAsync assigns
                // HasAddOns/AddOnsJson unconditionally — a fresh Product without
                // them used to blank the config). A file that DOES carry the
                // Add-ons column still wins.
                var importAddOns = ParseAddOnsColumn(GetValue(row, "addons", "addon"));
                var effectiveAddOns = importAddOns ?? existingProduct?.AddOns;

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
                    HasHotCold = hotPrice.HasValue || coldPrice.HasValue,
                    // Assigned through the AddOns property so AddOnsJson serializes
                    // in the same format the rest of the app stores; HasAddOns
                    // tracks whether any add-on is actually configured.
                    AddOns = effectiveAddOns,
                    HasAddOns = effectiveAddOns?.Count > 0
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

    // Optional Products "Add-ons" column (OT-03): entries are "Name:Price" pairs
    // separated by ';' (e.g. "Boba:15; Syrup:5"). Returns null when the column is
    // absent/blank so the caller falls back to the live product row; a non-empty
    // value must contain at least one valid entry.
    private static List<AddOnDto>? ParseAddOnsColumn(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        var entries = raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (entries.Length == 0)
            throw new ArgumentException("Add-ons must list at least one 'Name:Price' entry.");

        var list = new List<AddOnDto>();
        foreach (var entry in entries)
        {
            var separator = entry.LastIndexOf(':');
            if (separator <= 0 || separator == entry.Length - 1)
                throw new ArgumentException($"Invalid add-on entry '{entry}'. Use 'Name:Price' pairs separated by ';'.");

            var name = entry[..separator].Trim();
            var priceText = entry[(separator + 1)..].Trim();
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentException($"Invalid add-on entry '{entry}'. The add-on name is required.");
            // ':' also appears in formatted prices ("₱1,500") — reuse the shared
            // number cleanup before parsing.
            var price = ParseDecimal(priceText, $"Add-on '{name}' price", canBeZero: true);
            if (price < 0)
                throw new ArgumentException($"Add-on '{name}' price cannot be negative.");

            list.Add(new AddOnDto { Name = name, Price = price });
        }

        return list;
    }

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