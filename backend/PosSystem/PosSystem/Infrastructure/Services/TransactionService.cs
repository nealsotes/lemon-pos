using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class TransactionService : ITransactionService
{
    private readonly ITransactionRepository _transactionRepository;
    private readonly IProductRepository _productRepository;
    private readonly IInventoryService _inventoryService;
    private readonly IIngredientLotService _lotService;
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IProductIngredientRepository _productIngredientRepository;
    private readonly IUnitOfWork _unitOfWork;

    public TransactionService(
        ITransactionRepository transactionRepository,
        IProductRepository productRepository,
        IInventoryService inventoryService,
        IIngredientLotService lotService,
        IIngredientRepository ingredientRepository,
        IProductIngredientRepository productIngredientRepository,
        IUnitOfWork unitOfWork)
    {
        _transactionRepository = transactionRepository;
        _productRepository = productRepository;
        _inventoryService = inventoryService;
        _lotService = lotService;
        _ingredientRepository = ingredientRepository;
        _productIngredientRepository = productIngredientRepository;
        _unitOfWork = unitOfWork;
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
        using var dbTransaction = await _unitOfWork.BeginTransactionAsync();
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

            // Update stock for all products using atomic decrement
            foreach (var productQty in productQuantities)
            {
                var product = await _productRepository.GetByIdAsync(productQty.ProductId);
                if (product == null)
                {
                    throw new ArgumentException($"Product with ID {productQty.ProductId} not found");
                }

                if (product.Stock < productQty.TotalQuantity)
                {
                    throw new InvalidOperationException($"Insufficient stock for product {product.Name}. Current: {product.Stock}, Required: {productQty.TotalQuantity}");
                }

                var rowsAffected = await _productRepository.DecrementStockAsync(productQty.ProductId, productQty.TotalQuantity);

                if (rowsAffected == 0)
                {
                    var currentProduct = await _productRepository.GetByIdAsync(productQty.ProductId);
                    var errorMsg = $"Failed to update stock for product {product.Name}. Current stock: {currentProduct?.Stock ?? 0}, Required: {productQty.TotalQuantity}";
                    throw new InvalidOperationException(errorMsg);
                }
            }

            // Recipe-based ingredient deduction: aggregate required ingredient quantities per product sold
            var ingredientRequirements = new Dictionary<string, decimal>();
            foreach (var productQty in productQuantities)
            {
                var recipeLines = await _productIngredientRepository.GetByProductIdAsync(productQty.ProductId);
                foreach (var line in recipeLines)
                {
                    var required = line.QuantityPerUnit * productQty.TotalQuantity;
                    if (!ingredientRequirements.TryGetValue(line.IngredientId, out var existing))
                        ingredientRequirements[line.IngredientId] = required;
                    else
                        ingredientRequirements[line.IngredientId] = existing + required;
                }
            }

            // Validate ingredient availability
            foreach (var kv in ingredientRequirements)
            {
                var ingredient = await _ingredientRepository.GetByIdAsync(kv.Key);
                if (ingredient == null)
                    throw new InvalidOperationException($"Ingredient with ID {kv.Key} not found.");
                if (ingredient.Quantity < kv.Value)
                    throw new InvalidOperationException(
                        $"Insufficient ingredient: {ingredient.Name}. Required: {kv.Value} {ingredient.Unit}, Available: {ingredient.Quantity}");
            }

            // Deduct ingredients using FIFO lot tracking
            foreach (var kv in ingredientRequirements)
            {
                var ingredientId = kv.Key;
                var required = kv.Value;

                try
                {
                    await _lotService.DeductFifoAsync(ingredientId, required, MovementType.Sale, "POS Sale");
                }
                catch (InvalidOperationException)
                {
                    var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
                    throw new InvalidOperationException(
                        $"Insufficient ingredient: {ingredient?.Name ?? ingredientId}. Required: {required}, Available: {ingredient?.Quantity ?? 0}");
                }
            }

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
                var expectedTotal = netSubtotal + transaction.ServiceFee;
                if (Math.Abs(transaction.Total - expectedTotal) > 0.05m)
                {
                    transaction.Total = expectedTotal;
                }
            }

            // Add transaction via repository (which handles timestamp and save)
            transaction.Timestamp = DateTime.UtcNow;
            await _transactionRepository.AddAsync(transaction);

            // Commit the transaction
            await dbTransaction.CommitAsync();

            return transaction;
        }
        catch
        {
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
