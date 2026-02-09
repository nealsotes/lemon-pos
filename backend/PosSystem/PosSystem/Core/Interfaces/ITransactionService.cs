using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface ITransactionService
{
    Task<IEnumerable<Transaction>> GetAllTransactionsAsync();
    Task<Transaction?> GetTransactionByIdAsync(int id);
    Task<Transaction> CreateTransactionAsync(Transaction transaction);
    Task<IEnumerable<Transaction>> GetTransactionsByDateAsync(DateTime date);
    Task<IEnumerable<Transaction>> GetTransactionsByDateRangeAsync(DateTime startDate, DateTime endDate);
    Task<decimal> GetTotalSalesAsync(DateTime date);
    Task<object> GetDailyReportAsync(DateTime date);
} 