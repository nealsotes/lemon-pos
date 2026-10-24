namespace PosSystem.Core.Interfaces;

public enum ImportKind
{
    Products,
    Ingredients,
    Expenses
}

public class ImportRowError
{
    public int Row { get; set; }

    public string Message { get; set; } = string.Empty;
}

public class ImportResultReport
{
    public string Kind { get; set; } = string.Empty;

    public int Created { get; set; }

    public int Updated { get; set; }

    public int Skipped { get; set; }

    public List<ImportRowError> Errors { get; set; } = new();
}

public interface IImportService
{
    Task<ImportResultReport> ImportAsync(ImportKind kind, string fileName, Stream stream, string userId);

    byte[] GetTemplateWorkbook(ImportKind kind);
}