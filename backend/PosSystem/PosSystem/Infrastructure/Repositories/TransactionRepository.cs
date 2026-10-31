using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly PosSystemDbContext _context;
    private readonly ILogger<TransactionRepository> _logger;

    public TransactionRepository(PosSystemDbContext context, ILogger<TransactionRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IEnumerable<Transaction>> GetAllAsync()
    {
        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transactions with AddOns, retrying without AddOns");
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
    }

    public async Task<Transaction?> GetByIdAsync(int id)
    {
        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .FirstOrDefaultAsync(t => t.Id == id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transaction {Id} with AddOns, retrying without", id);
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .FirstOrDefaultAsync(t => t.Id == id);
        }
    }

    public async Task<Transaction> AddAsync(Transaction transaction)
    {
        // Sale-time preservation (offline spec §7.1): the service owns Timestamp —
        // UtcNow for an online sale, the client's original sale time for an offline
        // sale replayed on sync. Stamping unconditionally here would silently undo
        // the service's stamp. SyncedAt always records when this row reached the
        // server, so the two are distinguishable in the ledger.
        if (transaction.Timestamp == default)
        {
            transaction.Timestamp = DateTime.UtcNow;
        }
        transaction.SyncedAt = DateTime.UtcNow;

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();
        return transaction;
    }

    public async Task<Transaction?> GetByIdempotencyKeyAsync(string idempotencyKey)
    {
        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .FirstOrDefaultAsync(t => t.IdempotencyKey == idempotencyKey);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transaction by idempotency key, retrying without AddOns");
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .FirstOrDefaultAsync(t => t.IdempotencyKey == idempotencyKey);
        }
    }

    /// <summary>
    /// Exact half-open UTC window <c>[startDate, endDate)</c>.
    ///
    /// This used to snap both arguments to whole UTC days via <c>.Date</c> — correct
    /// nowhere once callers shift a PH business day into UTC: the snapped window
    /// pulled in the previous UTC day's evening sales and cut off the last morning
    /// hours of the requested day (roadmap item 2, OT-01). Callers pass converted
    /// exact windows; a caller passing midnight-to-midnight UTC bounds gets exactly
    /// the coverage it asked for, which is what the old code produced for that case.
    /// </summary>
    public async Task<IEnumerable<Transaction>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .Where(t => t.Timestamp >= startDate && t.Timestamp < endDate)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transactions by date range with AddOns, retrying without");
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Where(t => t.Timestamp >= startDate && t.Timestamp < endDate)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
    }
}