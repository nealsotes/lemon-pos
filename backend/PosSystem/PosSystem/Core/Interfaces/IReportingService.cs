using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IReportingService
{
    Task<object> GetDailyReportAsync(DateTime date);
    Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate);
    // OT-02: typed rows (were Task<object> anonymous types) so consumers like
    // ExportService bind compile-time to the real property names instead of
    // reflection-reading "sales"/"total" props that never existed (columns 0'ed).
    Task<List<TopSellingProductDto>> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10);
    Task<List<CategoryRevenueDto>> GetCategoryReportAsync(DateTime startDate, DateTime endDate);
    Task<object> GetAllTimeProductSalesAsync();
    Task<ProfitLossReportDto> GetProfitLossReportAsync(DateTime startDate, DateTime endDate);
    Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate);
    Task<AccountantSummaryDto> GetAccountantSummaryAsync(DateTime startDate, DateTime endDate);
    Task<SupplierBreakdownReportDto> GetSupplierBreakdownAsync(DateTime startDate, DateTime endDate);
    Task<ConsumptionReportDto> GetConsumptionReportAsync(DateTime startDate, DateTime endDate);
    Task<PeriodComparisonDto> GetPeriodComparisonAsync(DateTime startDate, DateTime endDate);
}