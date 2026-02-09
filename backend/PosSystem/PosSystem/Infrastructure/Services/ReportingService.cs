using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace PosSystem.Infrastructure.Services;

public class ReportingService : IReportingService
{
    private readonly PosSystemDbContext _context;

    public ReportingService(PosSystemDbContext context)
    {
        _context = context;
    }

    public async Task<object> GetDailyReportAsync(DateTime date)
    {
        // Use the input date as-is for start and end of day logic
        // This relies on the frontend passing the correct local date
        var startOfDay = date.Date;
        var endOfDay = startOfDay.AddDays(1);

        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .ToListAsync();

        var totalSales = transactions.Sum(t => t.Total);
        var transactionCount = transactions.Count;
        var averageTransactionValue = transactionCount > 0 ? totalSales / transactionCount : 0;

        // Get top products with product details
        var topProducts = await _context.Transactions
            .Where(t => t.Timestamp >= startOfDay && t.Timestamp < endOfDay)
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name, // Use the name stored in transaction items
                Category = g.FirstOrDefault()!.Category, // Use the category stored in transaction items
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(5)
            .ToListAsync();

        // Return data in the format expected by frontend
        return new
        {
            Date = date.Date,
            TotalSales = totalSales,
            TransactionCount = transactionCount,
            AverageTransactionValue = averageTransactionValue,
            TopProducts = topProducts
        };
    }

    public async Task<object> GetSalesReportAsync(DateTime startDate, DateTime endDate)
    {
        var transactions = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .ToListAsync();

        var dailySales = transactions
            .GroupBy(t => t.Timestamp.Date)
            .Select(g => new
            {
                Date = g.Key,
                TotalSales = g.Sum(t => t.Total),
                TransactionCount = g.Count()
            })
            .OrderBy(x => x.Date)
            .ToList();

        return new
        {
            StartDate = startDate.Date,
            EndDate = endDate.Date,
            TotalSales = transactions.Sum(t => t.Total),
            TotalTransactions = transactions.Count,
            DailySales = dailySales
        };
    }

    public async Task<object> GetTopSellingProductsAsync(DateTime startDate, DateTime endDate, int count = 10)
    {
        var topProducts = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Name = g.FirstOrDefault()!.Name, // Use the name stored in transaction items
                Category = g.FirstOrDefault()!.Category, // Use the category stored in transaction items
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(count)
            .ToListAsync();

        return topProducts;
    }

    public async Task<object> GetCategoryReportAsync(DateTime startDate, DateTime endDate)
    {
        var categorySales = await _context.Transactions
            .Where(t => t.Timestamp >= startDate && t.Timestamp <= endDate)
            .SelectMany(t => t.Items)
            .Join(_context.Products,
                item => item.ProductId,
                product => product.Id,
                (item, product) => new { item, product })
            .GroupBy(x => x.product.Category)
            .Select(g => new
            {
                Category = g.Key,
                Quantity = g.Sum(x => x.item.Quantity),
                Revenue = g.Sum(x => x.item.Price * x.item.Quantity)
            })
            .OrderByDescending(x => x.Revenue)
            .ToListAsync();

        return categorySales;
    }

    public async Task<object> GetAllTimeProductSalesAsync()
    {
        // Get all products with their total sold quantity (all-time)
        var products = await _context.Products
            .Where(p => p.IsActive)
            .ToListAsync();

        var productSales = await _context.Transactions
            .SelectMany(t => t.Items.Select(item => new { item, t.Timestamp }))
            .GroupBy(x => x.item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                TotalSold = g.Sum(x => x.item.Quantity),
                TotalRevenue = g.Sum(x => x.item.Price * x.item.Quantity),
                LastSoldDate = g.Max(x => x.Timestamp)
            })
            .ToListAsync();

        // Join products with their sales data
        var result = products.Select(p =>
        {
            var sales = productSales.FirstOrDefault(s => s.ProductId == p.Id);
            return new
            {
                ProductId = p.Id,
                Name = p.Name,
                Category = p.Category,
                Price = p.Price,
                Stock = p.Stock,
                Image = p.Image,
                TotalSold = sales?.TotalSold ?? 0,
                TotalRevenue = sales?.TotalRevenue ?? 0,
                LastSoldDate = sales?.LastSoldDate
            };
        })
        .OrderByDescending(p => p.TotalSold)
        .ToList();

        return result;
    }
} 