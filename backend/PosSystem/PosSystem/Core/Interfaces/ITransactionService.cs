using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface ITransactionService
{
    Task<IEnumerable<Transaction>> GetAllTransactionsAsync();
    Task<Transaction?> GetTransactionByIdAsync(int id);
    Task<Transaction> CreateTransactionAsync(Transaction transaction, DateTime? occurredAt = null);

    /// <summary>
    /// Creates a sale from the write DTO (RC-09): prices/add-ons resolved from the
    /// catalog, total recomputed server-side, status forced to "completed", and an
    /// optional client sale time (dto.OccurredAt) validated and honored for offline
    /// replays (offline spec §7.1). Returns the stored sale and whether the call was
    /// an idempotent replay (HTTP 200) rather than a fresh create (HTTP 201).
    /// </summary>
    Task<(Transaction Transaction, bool IsReplay)> CreateTransactionFromDtoAsync(
        CreateTransactionDto dto, string? idempotencyKeyHeader);

    /// <summary>
    /// One business day, given as a Philippine wall date (PhilippineTime). Returns
    /// the sales in that PH calendar day's exact UTC window.
    /// </summary>
    Task<IEnumerable<Transaction>> GetTransactionsByDateAsync(DateTime date);

    /// <summary>
    /// Exact half-open UTC window [startDate, endDate); callers convert business
    /// days into UTC windows via PhilippineTime.
    /// </summary>
    Task<IEnumerable<Transaction>> GetTransactionsByDateRangeAsync(DateTime startDate, DateTime endDate);

    Task<decimal> GetTotalSalesAsync(DateTime date);
    Task<object> GetDailyReportAsync(DateTime date);
}