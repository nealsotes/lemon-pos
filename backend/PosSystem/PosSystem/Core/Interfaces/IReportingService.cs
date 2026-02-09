namespace PosSystem.Core.Interfaces;

public interface IReportingService
{
    Task<object> GetDailyReportAsync(DateTime date);
    Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate);
    Task<object> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10);
    Task<object> GetCategoryReportAsync(DateTime startDate, DateTime endDate);
    Task<object> GetAllTimeProductSalesAsync();
}