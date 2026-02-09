namespace PosSystem.Core.Interfaces;

public interface IOfflineDataService
{
    Task<bool> IsOnlineAsync();
    Task SyncOfflineDataAsync();
    Task StoreOfflineTransactionAsync(object transaction);
    Task<IEnumerable<object>> GetPendingTransactionsAsync();
} 