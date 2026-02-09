using PosSystem.Core.Interfaces;

namespace PosSystem.Infrastructure.Services;

public class OfflineDataService : IOfflineDataService
{
    private readonly List<object> _pendingTransactions = new();

    public async Task<bool> IsOnlineAsync()
    {
        // In a real implementation, this would check network connectivity
        // For now, we'll simulate being online
        return await Task.FromResult(true);
    }

    public async Task SyncOfflineDataAsync()
    {
        // In a real implementation, this would sync pending transactions
        // For now, we'll just clear the pending transactions
        _pendingTransactions.Clear();
        await Task.CompletedTask;
    }

    public async Task StoreOfflineTransactionAsync(object transaction)
    {
        _pendingTransactions.Add(transaction);
        await Task.CompletedTask;
    }

    public async Task<IEnumerable<object>> GetPendingTransactionsAsync()
    {
        return await Task.FromResult(_pendingTransactions.AsEnumerable());
    }
} 