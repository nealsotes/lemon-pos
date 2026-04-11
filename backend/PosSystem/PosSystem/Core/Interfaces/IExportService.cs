namespace PosSystem.Core.Interfaces;

public enum ExportSection
{
    Full,
    Sales,
    Pnl,
    Inventory,
    Expenses
}

public enum ExportFormat
{
    Csv,
    Xlsx
}

public class ExportResult
{
    public byte[] Content { get; set; } = Array.Empty<byte>();
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
}

public interface IExportService
{
    Task<ExportResult> ExportAsync(ExportSection section, ExportFormat format, DateTime startDate, DateTime endDate);
    Task<ExportResult> ExportProductsAsync(ExportFormat format);
    Task<ExportResult> ExportIngredientsAsync(ExportFormat format);
    Task<ExportResult> ExportExpenseListAsync(ExportFormat format, DateTime startDate, DateTime endDate, string? categoryId);
}
