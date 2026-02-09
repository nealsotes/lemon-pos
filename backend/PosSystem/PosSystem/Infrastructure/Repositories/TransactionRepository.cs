using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Repositories;

public class TransactionRepository : ITransactionRepository
{
    private readonly PosSystemDbContext _context;

    public TransactionRepository(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Transaction>> GetAllAsync()
    {
        return await _context.Transactions
            .Include(t => t.Items)
                .ThenInclude(i => i.Discount)
            .Include(t => t.Items)
                .ThenInclude(i => i.AddOns)
            .OrderByDescending(t => t.Timestamp)
            .ToListAsync();
    }

    public async Task<Transaction?> GetByIdAsync(int id)
    {
        return await _context.Transactions
            .Include(t => t.Items)
                .ThenInclude(i => i.Discount)
            .Include(t => t.Items)
                .ThenInclude(i => i.AddOns)
            .FirstOrDefaultAsync(t => t.Id == id);
    }

    public async Task<Transaction> AddAsync(Transaction transaction)
    {
        // Use local time as requested to avoid timezone confusion in reports
        transaction.Timestamp = DateTime.Now;
        
        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();
        return transaction;
    }

    public async Task<IEnumerable<Transaction>> GetByDateAsync(DateTime date)
    {
        var startOfDay = date.Date;
        var endOfDay = startOfDay.AddDays(1);

        return await _context.Transactions
            .Include(t => t.Items)
                .ThenInclude(i => i.Discount)
            .Include(t => t.Items)
                .ThenInclude(i => i.AddOns)
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .OrderByDescending(t => t.Timestamp)
            .ToListAsync();
    }

    public async Task<IEnumerable<Transaction>> GetByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        var startOfDay = startDate.Date;
        var endOfDay = endDate.Date.AddDays(1);

        return await _context.Transactions
            .Include(t => t.Items)
                .ThenInclude(i => i.Discount)
            .Include(t => t.Items)
                .ThenInclude(i => i.AddOns)
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .OrderByDescending(t => t.Timestamp)
            .ToListAsync();
    }
} 