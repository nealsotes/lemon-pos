using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IReportingService
{
    Task<object> GetDailyReportAsync(DateTime date);
    Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate);
    Task<object> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10);
    Task<object> GetCategoryReportAsync(DateTime startDate, DateTime endDate);
    Task<object> GetAllTimeProductSalesAsync();
    Task<ProfitLossReportDto> GetProfitLossReportAsync(DateTime startDate, DateTime endDate);
    Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate);
    Task<AccountantSummaryDto> GetAccountantSummaryAsync(DateTime startDate, DateTime endDate);
}