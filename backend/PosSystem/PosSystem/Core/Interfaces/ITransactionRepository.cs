using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface ITransactionRepository
{
    Task<IEnumerable<Transaction>> GetAllAsync();
    Task<Transaction?> GetByIdAsync(int id);
    Task<Transaction> AddAsync(Transaction transaction);
    Task<Transaction?> GetByIdempotencyKeyAsync(string idempotencyKey);

    /// <summary>
    /// Exact half-open UTC window <c>[startDate, endDate)</c> — NO day snapping, NO
    /// timezone conversion (roadmap item 2, OT-01: callers convert PH business days
    /// to UTC windows via <see cref="PosSystem.Core.Time.PhilippineTime"/> and pass
    /// the result here).
    /// </summary>
    Task<IEnumerable<Transaction>> GetByDateRangeAsync(DateTime startDate, DateTime endDate);
}