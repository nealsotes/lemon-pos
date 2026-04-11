using ClosedXML.Excel;
using CsvHelper;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using System.Globalization;
using System.Text;

namespace PosSystem.Infrastructure.Services;

public class ExportService : IExportService
{
    private readonly IReportingService _reportingService;
    private readonly ITransactionRepository _transactionRepository;
    private readonly IExpenseService _expenseService;

    public ExportService(
        IReportingService reportingService,
        ITransactionRepository transactionRepository,
        IExpenseService expenseService)
    {
        _reportingService = reportingService;
        _transactionRepository = transactionRepository;
        _expenseService = expenseService;
    }

    public async Task<ExportResult> ExportAsync(ExportSection section, ExportFormat format, DateTime startDate, DateTime endDate)
    {
        var workbook = section switch
        {
            ExportSection.Full => await BuildFullAsync(startDate, endDate),
            ExportSection.Sales => await BuildSalesAsync(startDate, endDate),
            ExportSection.Pnl => await BuildPnlAsync(startDate, endDate),
            ExportSection.Inventory => await BuildInventoryAsync(startDate, endDate),
            ExportSection.Expenses => await BuildExpensesAsync(startDate, endDate),
            _ => throw new ArgumentException($"Unknown export section: {section}")
        };

        var sectionName = section.ToString().ToLowerInvariant();
        var stamp = DateTime.UtcNow.ToString("yyyy-MM-dd");

        if (format == ExportFormat.Csv)
        {
            return new ExportResult
            {
                Content = RenderCsv(workbook),
                FileName = $"{sectionName}_{stamp}.csv",
                ContentType = "text/csv"
            };
        }

        return new ExportResult
        {
            Content = RenderXlsx(workbook),
            FileName = $"{sectionName}_{stamp}.xlsx",
            ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    }

    // ── Builders: each returns a SectionWorkbook describing the data to render ──

    private async Task<SectionWorkbook> BuildFullAsync(DateTime startDate, DateTime endDate)
    {
        var wb = new SectionWorkbook("Full Report", startDate, endDate);

        // Summary sheet
        var accountant = await _reportingService.GetAccountantSummaryAsync(startDate, endDate);
        var summary = wb.AddSheet("Summary");
        summary.AddHeader("Metric", "Value");
        summary.AddRow("Gross Revenue", accountant.GrossRevenue);
        summary.AddRow("Total Discounts", accountant.TotalDiscounts);
        summary.AddRow("Net Revenue", accountant.NetRevenue);
        summary.AddRow("Cost of Goods", accountant.Cogs);
        summary.AddRow("Gross Profit", accountant.GrossProfit);
        summary.AddRow("Gross Margin %", accountant.GrossMarginPercent);
        summary.AddRow("Total Expenses", accountant.TotalExpenses);
        summary.AddRow("Net Profit", accountant.NetProfit);
        summary.AddRow("Net Margin %", accountant.NetMarginPercent);
        summary.AddRow("Transactions", accountant.TransactionCount);
        summary.AddRow("Average Ticket", accountant.AverageTicket);
        summary.AddRow("Inventory Value", accountant.CurrentInventoryValue);
        summary.AddRow("Ingredients Consumed", accountant.IngredientsConsumed);
        summary.AddRow("Waste / Shrinkage", accountant.WasteAndShrinkage);

        await AppendSalesSheetsAsync(wb, startDate, endDate);
        await AppendPnlSheetsAsync(wb, startDate, endDate);
        await AppendInventorySheetsAsync(wb, startDate, endDate);
        await AppendExpensesSheetAsync(wb, startDate, endDate);

        return wb;
    }

    private async Task<SectionWorkbook> BuildSalesAsync(DateTime startDate, DateTime endDate)
    {
        var wb = new SectionWorkbook("Sales Detail", startDate, endDate);
        await AppendSalesSheetsAsync(wb, startDate, endDate);
        return wb;
    }

    private async Task AppendSalesSheetsAsync(SectionWorkbook wb, DateTime startDate, DateTime endDate)
    {
        var transactions = (await _transactionRepository.GetByDateRangeAsync(startDate, endDate)).ToList();

        var txnSheet = wb.AddSheet("Transactions");
        txnSheet.AddHeader("ID", "Timestamp", "Items", "Subtotal", "Service Fee", "Total", "Payment Method", "Service Type", "Customer", "Status");
        foreach (var t in transactions.OrderByDescending(t => t.Timestamp))
        {
            var subtotal = t.Items.Sum(i => i.Total);
            txnSheet.AddRow(
                t.Id,
                t.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                t.Items.Count,
                subtotal,
                t.ServiceFee,
                t.Total,
                t.PaymentMethod,
                t.ServiceType.ToString(),
                t.CustomerInfo?.Name ?? string.Empty,
                t.Status);
        }

        var itemsSheet = wb.AddSheet("Line Items");
        itemsSheet.AddHeader("Transaction ID", "Timestamp", "Product", "Category", "Qty", "Unit Price", "Line Total", "Temperature", "Add-ons");
        foreach (var t in transactions.OrderByDescending(t => t.Timestamp))
        {
            foreach (var item in t.Items)
            {
                var addOns = item.AddOns != null && item.AddOns.Any()
                    ? string.Join("; ", item.AddOns.Select(a => a.Name))
                    : string.Empty;
                itemsSheet.AddRow(
                    t.Id,
                    t.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
                    item.Name,
                    item.Category,
                    item.Quantity,
                    item.Price,
                    item.Total,
                    item.Temperature.ToString(),
                    addOns);
            }
        }

        var topProducts = await _reportingService.GetTopSellingProductsAsync(startDate, endDate, 50);
        var topSheet = wb.AddSheet("Top Products");
        topSheet.AddHeader("Rank", "Name", "Category", "Quantity Sold", "Revenue");
        int rank = 1;
        foreach (var item in EnumerateDynamicList(topProducts))
        {
            topSheet.AddRow(
                rank++,
                GetProp(item, "name") ?? GetProp(item, "Name") ?? string.Empty,
                GetProp(item, "category") ?? GetProp(item, "Category") ?? string.Empty,
                GetProp(item, "quantity") ?? GetProp(item, "Quantity") ?? 0,
                GetProp(item, "sales") ?? GetProp(item, "Sales") ?? 0);
        }

        var categoryBreakdown = await _reportingService.GetCategoryReportAsync(startDate, endDate);
        var catSheet = wb.AddSheet("Sales by Category");
        catSheet.AddHeader("Category", "Total", "Percent");
        foreach (var cat in EnumerateDynamicList(categoryBreakdown))
        {
            catSheet.AddRow(
                GetProp(cat, "category") ?? GetProp(cat, "Category") ?? string.Empty,
                GetProp(cat, "total") ?? GetProp(cat, "Total") ?? 0,
                GetProp(cat, "percent") ?? GetProp(cat, "Percent") ?? 0);
        }
    }

    private async Task<SectionWorkbook> BuildPnlAsync(DateTime startDate, DateTime endDate)
    {
        var wb = new SectionWorkbook("Profit & Loss", startDate, endDate);
        await AppendPnlSheetsAsync(wb, startDate, endDate);
        return wb;
    }

    private async Task AppendPnlSheetsAsync(SectionWorkbook wb, DateTime startDate, DateTime endDate)
    {
        var pnl = await _reportingService.GetProfitLossReportAsync(startDate, endDate);

        var summary = wb.AddSheet("P&L Summary");
        summary.AddHeader("Metric", "Value");
        summary.AddRow("Gross Revenue", pnl.GrossRevenue);
        summary.AddRow("Total Discounts", pnl.TotalDiscounts);
        summary.AddRow("Net Revenue", pnl.NetRevenue);
        summary.AddRow("Cost of Goods", pnl.Cogs);
        summary.AddRow("Gross Profit", pnl.GrossProfit);
        summary.AddRow("Gross Margin %", pnl.MarginPercent);
        summary.AddRow("Total Expenses", pnl.TotalExpenses);
        summary.AddTotalRow("Net Profit", pnl.NetProfit);
        summary.AddRow("Net Margin %", pnl.NetMarginPercent);

        if (pnl.ExpensesByCategory.Any())
        {
            var expCat = wb.AddSheet("Expenses by Category");
            expCat.AddHeader("Category", "Total");
            foreach (var cat in pnl.ExpensesByCategory)
            {
                expCat.AddRow(cat.CategoryName, cat.Total);
            }
        }

        if (pnl.Breakdown.Any())
        {
            var breakdown = wb.AddSheet("Period Breakdown");
            breakdown.AddHeader("Period", "Revenue", "Cost of Goods", "Gross Profit", "Margin %", "Expenses", "Net Profit", "Net Margin %");
            foreach (var row in pnl.Breakdown)
            {
                breakdown.AddRow(row.Period, row.Revenue, row.Cogs, row.GrossProfit, row.MarginPercent, row.Expenses, row.NetProfit, row.NetMarginPercent);
            }
        }
    }

    private async Task<SectionWorkbook> BuildInventoryAsync(DateTime startDate, DateTime endDate)
    {
        var wb = new SectionWorkbook("Inventory & Stock", startDate, endDate);
        await AppendInventorySheetsAsync(wb, startDate, endDate);
        return wb;
    }

    private async Task AppendInventorySheetsAsync(SectionWorkbook wb, DateTime startDate, DateTime endDate)
    {
        var inventory = await _reportingService.GetInventoryValuationReportAsync(startDate, endDate);

        var valuation = wb.AddSheet("Valuation");
        valuation.AddHeader("Metric", "Value");
        valuation.AddRow("Total Value", inventory.TotalValue);
        valuation.AddRow("Period Change", inventory.PeriodChange);
        valuation.AddRow("Waste / Shrinkage", inventory.WasteAndShrinkage);
        valuation.AddRow("Low Stock Items", inventory.LowStockCount);

        if (inventory.TopIngredients.Any())
        {
            var top = wb.AddSheet("Top Ingredients");
            top.AddHeader("Name", "On Hand", "Unit", "Unit Cost", "Total Value", "% of Total");
            foreach (var ing in inventory.TopIngredients)
            {
                top.AddRow(ing.Name, ing.OnHand, ing.Unit, ing.UnitCost, ing.TotalValue, ing.PercentOfTotal);
            }
        }

        if (inventory.MovementSummary.Any())
        {
            var movement = wb.AddSheet("Movements");
            movement.AddHeader("Type", "Count", "Total Cost");
            foreach (var m in inventory.MovementSummary)
            {
                movement.AddRow(m.Type, m.Count, m.TotalCost);
            }
        }

        var consumption = await _reportingService.GetConsumptionReportAsync(startDate, endDate);
        if (consumption.Items.Any())
        {
            var cons = wb.AddSheet("Consumption");
            cons.AddHeader("Ingredient", "Unit", "Qty Used", "Cost Consumed", "% of Total", "Avg Daily");
            foreach (var c in consumption.Items)
            {
                cons.AddRow(c.IngredientName, c.Unit, c.QtyUsed, c.CostConsumed, c.PercentOfTotal, c.AvgDaily);
            }
        }

        var suppliers = await _reportingService.GetSupplierBreakdownAsync(startDate, endDate);
        if (suppliers.SupplierSummary.Any())
        {
            var sup = wb.AddSheet("Suppliers");
            sup.AddHeader("Supplier", "Purchases", "Total Spent", "Avg Cost / Purchase", "Ingredients");
            foreach (var s in suppliers.SupplierSummary)
            {
                sup.AddRow(s.Supplier, s.PurchaseCount, s.TotalSpent, s.AvgCostPerPurchase, string.Join("; ", s.Ingredients));
            }
        }
    }

    private async Task<SectionWorkbook> BuildExpensesAsync(DateTime startDate, DateTime endDate)
    {
        var wb = new SectionWorkbook("Expenses", startDate, endDate);
        await AppendExpensesSheetAsync(wb, startDate, endDate);
        return wb;
    }

    private async Task AppendExpensesSheetAsync(SectionWorkbook wb, DateTime startDate, DateTime endDate)
    {
        var expenses = (await _expenseService.GetExpensesAsync(startDate, endDate)).ToList();

        var sheet = wb.AddSheet("Expenses");
        sheet.AddHeader("Date", "Category", "Description", "Amount", "Recurring", "Recurrence", "Notes", "Created By");
        foreach (var e in expenses.OrderByDescending(x => x.Date))
        {
            sheet.AddRow(
                e.Date.ToString("yyyy-MM-dd"),
                e.CategoryName,
                e.Description,
                e.Amount,
                e.IsRecurring ? "Yes" : "No",
                e.RecurrenceType ?? string.Empty,
                e.Notes ?? string.Empty,
                e.CreatedBy);
        }

        var byCat = await _expenseService.GetExpensesByCategoryAsync(startDate, endDate);
        if (byCat.Any())
        {
            var catSheet = wb.AddSheet("Expenses by Category");
            catSheet.AddHeader("Category", "Total");
            foreach (var c in byCat)
            {
                catSheet.AddRow(c.CategoryName, c.Total);
            }
        }
    }

    // ── Renderers ──

    private static byte[] RenderCsv(SectionWorkbook wb)
    {
        using var ms = new MemoryStream();
        using var writer = new StreamWriter(ms, new UTF8Encoding(true));
        using var csv = new CsvWriter(writer, CultureInfo.InvariantCulture);

        csv.WriteField(wb.Title);
        csv.NextRecord();
        csv.WriteField($"Date Range: {wb.StartDate:yyyy-MM-dd} to {wb.EndDate:yyyy-MM-dd}");
        csv.NextRecord();
        csv.WriteField($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
        csv.NextRecord();
        csv.NextRecord();

        foreach (var sheet in wb.Sheets)
        {
            csv.WriteField(sheet.Name.ToUpperInvariant());
            csv.NextRecord();

            if (sheet.Header != null)
            {
                foreach (var col in sheet.Header) csv.WriteField(col);
                csv.NextRecord();
            }

            foreach (var row in sheet.Rows)
            {
                foreach (var cell in row) csv.WriteField(FormatCell(cell));
                csv.NextRecord();
            }

            csv.NextRecord();
        }

        writer.Flush();
        return ms.ToArray();
    }

    private static byte[] RenderXlsx(SectionWorkbook wb)
    {
        using var workbook = new XLWorkbook();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var sheet in wb.Sheets)
        {
            var baseName = SanitizeSheetName(sheet.Name);
            var name = baseName;
            var suffix = 2;
            while (!usedNames.Add(name))
            {
                var candidate = $"{baseName} ({suffix++})";
                name = candidate.Length > 31 ? candidate.Substring(0, 31) : candidate;
            }
            var ws = workbook.Worksheets.Add(name);

            var row = 1;
            ws.Cell(row, 1).Value = wb.Title;
            ws.Cell(row, 1).Style.Font.Bold = true;
            ws.Cell(row, 1).Style.Font.FontSize = 14;
            row++;
            ws.Cell(row, 1).Value = $"Date Range: {wb.StartDate:yyyy-MM-dd} to {wb.EndDate:yyyy-MM-dd}";
            ws.Cell(row, 1).Style.Font.Italic = true;
            row++;
            ws.Cell(row, 1).Value = $"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC";
            ws.Cell(row, 1).Style.Font.Italic = true;
            row += 2;

            if (sheet.Header != null)
            {
                for (var c = 0; c < sheet.Header.Length; c++)
                {
                    var cell = ws.Cell(row, c + 1);
                    cell.Value = sheet.Header[c];
                    cell.Style.Font.Bold = true;
                    cell.Style.Fill.BackgroundColor = XLColor.LightGray;
                    cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
                }
                row++;
            }

            for (var i = 0; i < sheet.Rows.Count; i++)
            {
                var dataRow = sheet.Rows[i];
                var isTotalRow = sheet.TotalRowIndices.Contains(i);
                for (var c = 0; c < dataRow.Length; c++)
                {
                    var cell = ws.Cell(row, c + 1);
                    WriteCell(cell, dataRow[c]);
                    if (isTotalRow)
                    {
                        cell.Style.Font.Bold = true;
                        // Accounting convention: single top border + double bottom border
                        cell.Style.Border.TopBorder = XLBorderStyleValues.Thin;
                        cell.Style.Border.BottomBorder = XLBorderStyleValues.Double;
                    }
                }
                row++;
            }

            ws.Columns().AdjustToContents();
        }

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }

    private static void WriteCell(IXLCell cell, object? value)
    {
        switch (value)
        {
            case null:
                cell.Value = string.Empty;
                break;
            case decimal d:
                cell.Value = d;
                cell.Style.NumberFormat.Format = "#,##0.00";
                break;
            case double dbl:
                cell.Value = dbl;
                cell.Style.NumberFormat.Format = "#,##0.00";
                break;
            case int i:
                cell.Value = i;
                break;
            case long l:
                cell.Value = l;
                break;
            case DateTime dt:
                cell.Value = dt;
                cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm:ss";
                break;
            default:
                cell.Value = value.ToString() ?? string.Empty;
                break;
        }
    }

    private static string FormatCell(object? value)
    {
        return value switch
        {
            null => string.Empty,
            decimal d => d.ToString("0.00", CultureInfo.InvariantCulture),
            double dbl => dbl.ToString("0.00", CultureInfo.InvariantCulture),
            DateTime dt => dt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty
        };
    }

    private static string SanitizeSheetName(string name)
    {
        // Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ]
        var cleaned = new string(name.Where(c => c != ':' && c != '\\' && c != '/' && c != '?' && c != '*' && c != '[' && c != ']').ToArray());
        return cleaned.Length > 31 ? cleaned.Substring(0, 31) : cleaned;
    }

    // Safely enumerate dynamic/object return values from ReportingService methods
    private static IEnumerable<object> EnumerateDynamicList(object? value)
    {
        if (value is System.Collections.IEnumerable enumerable and not string)
        {
            foreach (var item in enumerable)
            {
                if (item != null) yield return item;
            }
        }
    }

    private static object? GetProp(object source, string name)
    {
        var prop = source.GetType().GetProperty(name,
            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.IgnoreCase);
        return prop?.GetValue(source);
    }
}

// ── Small internal data model used to describe a multi-sheet export ──
internal class SectionWorkbook
{
    public string Title { get; }
    public DateTime StartDate { get; }
    public DateTime EndDate { get; }
    public List<SectionSheet> Sheets { get; } = new();

    public SectionWorkbook(string title, DateTime startDate, DateTime endDate)
    {
        Title = title;
        StartDate = startDate;
        EndDate = endDate;
    }

    public SectionSheet AddSheet(string name)
    {
        var sheet = new SectionSheet(name);
        Sheets.Add(sheet);
        return sheet;
    }
}

internal class SectionSheet
{
    public string Name { get; }
    public string[]? Header { get; private set; }
    public List<object?[]> Rows { get; } = new();
    // Row indices (0-based into Rows) that should render as "bottom-line" totals:
    // top single border + bottom double border + bold, per accounting convention.
    public HashSet<int> TotalRowIndices { get; } = new();

    public SectionSheet(string name)
    {
        Name = name;
    }

    public void AddHeader(params string[] columns)
    {
        Header = columns;
    }

    public void AddRow(params object?[] values)
    {
        Rows.Add(values);
    }

    public void AddTotalRow(params object?[] values)
    {
        TotalRowIndices.Add(Rows.Count);
        Rows.Add(values);
    }
}
