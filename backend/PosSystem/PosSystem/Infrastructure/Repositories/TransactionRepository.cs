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
        transaction.Timestamp = DateTime.UtcNow;

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();
        return transaction;
    }

    public async Task<IEnumerable<Transaction>> GetByDateAsync(DateTime date)
    {
        var startOfDay = date.Date;
        var endOfDay = startOfDay.AddDays(1);

        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transactions by date with AddOns, retrying without");
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
    }

    public async Task<IEnumerable<Transaction>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        var startOfDay = startDate.Date;
        var endOfDay = endDate.Date.AddDays(1);

        try
        {
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Include(t => t.Items)
                    .ThenInclude(i => i.AddOns)
                .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load transactions by date range with AddOns, retrying without");
            return await _context.Transactions
                .Include(t => t.Items)
                    .ThenInclude(i => i.Discount)
                .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
                .OrderByDescending(t => t.Timestamp)
                .ToListAsync();
        }
    }
} 