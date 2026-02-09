using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace PosSystem.Infrastructure.Services;

public class TransactionService : ITransactionService
{
    private readonly ITransactionRepository _transactionRepository;
    private readonly IProductRepository _productRepository;
    private readonly IInventoryService _inventoryService;
    private readonly PosSystemDbContext _context;

    public TransactionService(
        ITransactionRepository transactionRepository,
        IProductRepository productRepository,
        IInventoryService inventoryService,
        PosSystemDbContext context)
    {
        _transactionRepository = transactionRepository;
        _productRepository = productRepository;
        _inventoryService = inventoryService;
        _context = context;
    }

    public async Task<IEnumerable<Transaction>> GetAllTransactionsAsync()
    {
        return await _transactionRepository.GetAllAsync();
    }

    public async Task<Transaction?> GetTransactionByIdAsync(int id)
    {
        return await _transactionRepository.GetByIdAsync(id);
    }

    public async Task<Transaction> CreateTransactionAsync(Transaction transaction)
    {
        // Use a database transaction to ensure atomicity
        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        try
        {
            // Group items by product ID to handle multiple quantities of the same product
            var productQuantities = transaction.Items
                .GroupBy(item => item.ProductId)
                .Select(g => new { ProductId = g.Key, TotalQuantity = g.Sum(item => item.Quantity) })
                .ToList();

            // Validate stock availability for all products first
            foreach (var productQty in productQuantities)
            {
                var product = await _productRepository.GetByIdAsync(productQty.ProductId);
                if (product == null)
                {
                    throw new ArgumentException($"Product with ID {productQty.ProductId} not found");
                }

                if (!await _inventoryService.CheckStockAvailabilityAsync(productQty.ProductId, productQty.TotalQuantity))
                {
                    throw new InvalidOperationException($"Insufficient stock for product {product.Name}. Required: {productQty.TotalQuantity}, Available: {product.Stock}");
                }
            }

            // Update stock for all products using raw SQL to ensure it works
            // This approach directly updates the database and is more reliable
            foreach (var productQty in productQuantities)
            {
                // First verify stock is sufficient
                var product = await _context.Products
                    .FirstOrDefaultAsync(p => p.Id == productQty.ProductId && p.IsActive);
                
                if (product == null)
                {
                    throw new ArgumentException($"Product with ID {productQty.ProductId} not found");
                }

                if (product.Stock < productQty.TotalQuantity)
                {
                    throw new InvalidOperationException($"Insufficient stock for product {product.Name}. Current: {product.Stock}, Required: {productQty.TotalQuantity}");
                }

                // Use raw SQL to update stock directly - this ensures the update happens
                // Using ExecuteSqlInterpolatedAsync for parameterized queries (prevents SQL injection)
                var quantity = productQty.TotalQuantity;
                var productId = productQty.ProductId;
                var now = DateTime.UtcNow;
                
                var rowsAffected = await _context.Database.ExecuteSqlInterpolatedAsync(
                    $"UPDATE Products SET Stock = Stock - {quantity}, UpdatedAt = {now} WHERE Id = {productId} AND IsActive = 1 AND Stock >= {quantity}"
                );

                if (rowsAffected == 0)
                {
                    // Re-check stock in case it changed
                    var currentProduct = await _context.Products
                        .FirstOrDefaultAsync(p => p.Id == productQty.ProductId && p.IsActive);
                    var errorMsg = $"Failed to update stock for product {product.Name}. Current stock: {currentProduct?.Stock ?? 0}, Required: {productQty.TotalQuantity}";
                    throw new InvalidOperationException(errorMsg);
                }
            }

            // Calculate total if not provided (includes service fee if already in total, otherwise calculate from items)
            // Calculate total if not provided (includes service fee if already in total, otherwise calculate from items)
            var itemsSubtotal = transaction.Items.Sum(item => item.Price * item.Quantity);
            var itemsDiscount = transaction.Items.Sum(item => item.Discount?.Amount ?? 0);
            var netSubtotal = itemsSubtotal - itemsDiscount;

            if (transaction.Total == 0)
            {
                transaction.Total = netSubtotal + transaction.ServiceFee;
            }
            else
            {
                // Ensure service fee is included in total (if service fee is set but not in total, add it)
                // We trust the frontend's total mostly, but ensure calculation consistency
                // If total is less than net subtotal (without service fee), it might be missing service fee
                
                // Allow a small margin of error for floating point calculations
                var expectedTotal = netSubtotal + transaction.ServiceFee;
                if (Math.Abs(transaction.Total - expectedTotal) > 0.05m) 
                {
                    // If the provided total significantly differs from calculation, rely on calculation
                    transaction.Total = expectedTotal;
                }
            }

            // Add transaction
            transaction.Timestamp = DateTime.UtcNow;
            _context.Transactions.Add(transaction);
            
            // Save all changes together (products and transaction) in one call
            await _context.SaveChangesAsync();

            // Commit the transaction
            await dbTransaction.CommitAsync();

            return transaction;
        }
        catch (Exception ex)
        {
            // Rollback on any error
            await dbTransaction.RollbackAsync();
            throw;
        }
    }

    public async Task<IEnumerable<Transaction>> GetTransactionsByDateAsync(DateTime date)
    {
        return await _transactionRepository.GetByDateAsync(date);
    }

    public async Task<IEnumerable<Transaction>> GetTransactionsByDateRangeAsync(DateTime startDate, DateTime endDate)
    {
        return await _transactionRepository.GetByDateRangeAsync(startDate, endDate);
    }

    public async Task<decimal> GetTotalSalesAsync(DateTime date)
    {
        var transactions = await GetTransactionsByDateAsync(date);
        return transactions.Sum(t => t.Total);
    }

    public async Task<object> GetDailyReportAsync(DateTime date)
    {
        var transactions = await GetTransactionsByDateAsync(date);
        var totalSales = transactions.Sum(t => t.Total);
        var transactionCount = transactions.Count();
        var averageTransactionValue = transactionCount > 0 ? totalSales / transactionCount : 0;

        var topProducts = transactions
            .SelectMany(t => t.Items)
            .GroupBy(item => item.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                Quantity = g.Sum(item => item.Quantity),
                Revenue = g.Sum(item => item.Price * item.Quantity)
            })
            .OrderByDescending(p => p.Quantity)
            .Take(5)
            .ToList();

        return new
        {
            Date = date.Date,
            TotalSales = totalSales,
            TransactionCount = transactionCount,
            AverageTransactionValue = averageTransactionValue,
            TopProducts = topProducts
        };
    }
} 