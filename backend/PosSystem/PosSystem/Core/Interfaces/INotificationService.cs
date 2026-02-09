namespace PosSystem.Core.Interfaces;

public interface INotificationService
{
    Task SendLowStockAlertAsync(string productId, int currentStock);
    Task SendTransactionNotificationAsync(object transaction);
    Task SendDailyReportAsync(DateTime date);
} 