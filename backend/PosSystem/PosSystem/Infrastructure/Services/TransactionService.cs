using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MySqlConnector;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;
using PosSystem.Infrastructure.Data;

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
    private readonly PosSystemDbContext _context;
    private readonly IConfiguration? _configuration;

    public TransactionService(
        ITransactionRepository transactionRepository,
        IProductRepository productRepository,
        IInventoryService inventoryService,
        IIngredientLotService lotService,
        IIngredientRepository ingredientRepository,
        IProductIngredientRepository productIngredientRepository,
        IUnitOfWork unitOfWork,
        PosSystemDbContext context,
        IConfiguration? configuration = null)
    {
        _transactionRepository = transactionRepository;
        _productRepository = productRepository;
        _inventoryService = inventoryService;
        _lotService = lotService;
        _ingredientRepository = ingredientRepository;
        _productIngredientRepository = productIngredientRepository;
        _unitOfWork = unitOfWork;
        _context = context;
        _configuration = configuration;
    }

    public async Task<IEnumerable<Transaction>> GetAllTransactionsAsync()
    {
        return await _transactionRepository.GetAllAsync();
    }

    public async Task<Transaction?> GetTransactionByIdAsync(int id)
    {
        return await _transactionRepository.GetByIdAsync(id);
    }

    public async Task<Transaction> CreateTransactionAsync(Transaction transaction, DateTime? occurredAt = null)
    {
        // Idempotent replay first: a sale whose key is already stored returns the stored
        // transaction with no stock, ingredient, or ledger changes. This is the guard
        // against the classic retry double-charge: the client posts once, the response
        // is lost (timeout, connection drop), and the retry would otherwise ring the
        // same sale a second time. Without a key this method behaves exactly as before.
        if (!string.IsNullOrWhiteSpace(transaction.IdempotencyKey))
        {
            var completed = await _transactionRepository.GetByIdempotencyKeyAsync(transaction.IdempotencyKey);
            if (completed != null)
            {
                EnsureSamePayloadOrConflict(completed, transaction);
                return completed;
            }
        }

        // Use a database transaction to ensure atomicity. A MySQL lock deadlock or
        // lock-wait victim is rolled back wholesale by the server, so the whole sale
        // reruns on a fresh transaction (bounded); nothing half-applied can survive.
        var attempt = 0;
        while (true)
        {
            attempt++;
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
                        // Stock-ledger desync fix (LPOS-SL-01): the old catch
                        // reformulated the failure from the ingredient ROW, which on
                        // a desynced legacy row contradicts the ledger ("Required:
                        // 1.0000, Available: 3.00" while the ledger holds ~0). The
                        // honest figure is the lot-side availability, computed with
                        // the same rule the dedup sweep uses (active lots, remaining
                        // > 0). One cashier-readable line; the raw lot-service text
                        // is never leaked.
                        var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
                        var ledgerAvailable = (await _lotService.GetLotsAsync(ingredientId))
                            .Where(l => l.RemainingQuantity > 0)
                            .Sum(l => l.RemainingQuantity);
                        throw new InvalidOperationException(
                            $"Insufficient ingredient: {ingredient?.Name ?? ingredientId}. Required: {required}, Available: {ledgerAvailable} (stock ledger). The item row shows {ingredient?.Quantity ?? 0}; use Adjust Stock to reconcile or re-import with a stock entry.");
                    }
                }

                // Calculate the total from the server-resolved line money (roadmap item
                // 2, OT-14: line prices arrive add-on-inclusive from the write DTO —
                // product price + add-ons — so the total includes add-on money exactly
                // once). Rounded to the money scale at the boundary (DP-01): no
                // fractional-peso drift may enter the ledger.
                var itemsSubtotal = transaction.Items.Sum(item => item.Price * item.Quantity);
                var itemsDiscount = transaction.Items.Sum(item => item.Discount?.Amount ?? 0);
                var netSubtotal = itemsSubtotal - itemsDiscount;

                if (transaction.Total == 0)
                {
                    transaction.Total = Math.Round(netSubtotal + transaction.ServiceFee, 2, MidpointRounding.AwayFromZero);
                }
                else
                {
                    var expectedTotal = netSubtotal + transaction.ServiceFee;
                    if (Math.Abs(transaction.Total - expectedTotal) > 0.05m)
                    {
                        transaction.Total = Math.Round(expectedTotal, 2, MidpointRounding.AwayFromZero);
                    }
                }

                // Stamp the SALE time: UtcNow for an online sale, the validated client
                // sale time for an offline replay (offline spec §7.1). Both create
                // sites — here and the repository — were re-stamping UtcNow, which is
                // why a queued sale synced hours later booked the wrong day.
                transaction.Timestamp = occurredAt ?? DateTime.UtcNow;
                await _transactionRepository.AddAsync(transaction);

                // Commit the transaction
                await dbTransaction.CommitAsync();

                return transaction;
            }
            catch (Exception ex) when (IsTransientLockFailure(ex) && attempt < 3)
            {
                // Deadlock victim: the server has already aborted this transaction. Drop
                // stale tracked entities and retry the whole sale; the pre-check above
                // (or the duplicate-key resolve below) keeps a retried key from ringing
                // a second charge even across attempts.
                await dbTransaction.RollbackAsync();
                _context.ChangeTracker.Clear();
            }
            catch (DbUpdateException ex) when (IsDuplicateKeyError(ex) && !string.IsNullOrWhiteSpace(transaction.IdempotencyKey))
            {
                // Two requests with the same key raced: the unique index on IdempotencyKey
                // let only the first one insert. This attempt already rolled back below, so
                // its stock and ingredient changes are discarded and we resolve to the
                // stored sale instead of surfacing a duplicate-key error to the caller.
                await dbTransaction.RollbackAsync();
                var existing = await _transactionRepository.GetByIdempotencyKeyAsync(transaction.IdempotencyKey);
                if (existing == null)
                    throw;

                EnsureSamePayloadOrConflict(existing, transaction);
                return existing;
            }
            catch
            {
                await dbTransaction.RollbackAsync();
                throw;
            }
        }
    }

    /// <summary>
    /// The maximum age of a replayed sale's original rung-up time. A sale older than
    /// this is rejected loudly rather than back-dated quietly (offline spec §7.1).
    /// </summary>
    private int MaxOfflineSaleAgeDays => _configuration?.GetValue("Offline:MaxSaleAgeDays", 7) ?? 7;

    /// <summary>
    /// Creates a sale from the write DTO (roadmap item 2, RC-09). The client states
    /// WHAT was sold; the server states WHAT it cost — product prices, add-on prices,
    /// discounts and the total are all resolved/recomputed here rather than trusted
    /// from the request body.
    /// </summary>
    public async Task<(Transaction Transaction, bool IsReplay)> CreateTransactionFromDtoAsync(
        CreateTransactionDto dto, string? idempotencyKeyHeader)
    {
        ArgumentNullException.ThrowIfNull(dto);

        // Key merge (header wins), same precedence and bound as the pre-DTO contract.
        var headerKey = string.IsNullOrWhiteSpace(idempotencyKeyHeader) ? null : idempotencyKeyHeader.Trim();
        var bodyKey = string.IsNullOrWhiteSpace(dto.IdempotencyKey) ? null : dto.IdempotencyKey.Trim();
        var key = headerKey ?? bodyKey;
        if (key != null && key.Length > 100)
        {
            throw new ArgumentException("Idempotency-Key must be at most 100 characters");
        }

        var transaction = await MapCreateDtoToTransactionAsync(dto, key);
        var created = await CreateTransactionAsync(transaction, ResolveOccurredAt(dto.OccurredAt));
        return (created, !ReferenceEquals(created, transaction));
    }

    /// <summary>
    /// Validates the client-supplied sale time (offline replay) and normalizes it to
    /// UTC. Naive datetimes are treated as UTC, matching the server's own storage
    /// convention; the checkout frontend always sends ISO with the UTC designator.
    /// </summary>
    private DateTime? ResolveOccurredAt(DateTime? occurredAt)
    {
        if (!occurredAt.HasValue)
        {
            return null;
        }

        var value = occurredAt.Value.Kind == DateTimeKind.Utc
            ? occurredAt.Value
            : DateTime.SpecifyKind(occurredAt.Value, DateTimeKind.Utc);

        var now = DateTime.UtcNow;
        if (value > now.AddMinutes(2))
        {
            throw new ArgumentException(
                $"occurredAt '{value:u}' is in the future. The till's clock is off; fix it and retry the sync.");
        }

        if (value < now.AddDays(-MaxOfflineSaleAgeDays))
        {
            throw new ArgumentException(
                $"occurredAt '{value:u}' is older than {MaxOfflineSaleAgeDays} days and cannot be booked. " +
                "Ring the sale again with the current time.");
        }

        return value;
    }

    /// <summary>
    /// Maps the write DTO onto a <see cref="Transaction"/> with server-resolved money.
    /// The line price is add-on-inclusive (product price for the temperature, plus the
    /// add-ons the line carries per unit), matching what the checkout cart bakes and
    /// what the receipts print; the total is recomputed in the entity create path.
    /// </summary>
    private async Task<Transaction> MapCreateDtoToTransactionAsync(CreateTransactionDto dto, string? key)
    {
        if (dto.Items == null || dto.Items.Count == 0)
        {
            throw new ArgumentException("Transaction must contain at least one item");
        }

        if (dto.ServiceFee < 0)
        {
            throw new ArgumentException("ServiceFee cannot be negative");
        }

        var transaction = new Transaction
        {
            IdempotencyKey = key,
            PaymentMethod = string.IsNullOrWhiteSpace(dto.PaymentMethod) ? "cash" : dto.PaymentMethod.Trim(),
            ServiceType = dto.ServiceType,
            ServiceFee = dto.ServiceFee,
            CustomerInfo = dto.CustomerInfo ?? new CustomerInfo(),
            // Whitelist: a create is a completed, paid sale. "pending" is the
            // client-side queue marker and must never reach the ledger (it would
            // hide the sale from every report, which counts only "completed").
            Status = "completed",
            Notes = dto.Notes ?? string.Empty,
            AmountReceived = dto.AmountReceived,
            Change = dto.Change,
            Items = new List<TransactionItem>()
        };

        foreach (var line in dto.Items)
        {
            if (line == null || string.IsNullOrWhiteSpace(line.ProductId))
            {
                throw new ArgumentException("Item is missing ProductId");
            }
            if (line.Quantity <= 0)
            {
                throw new ArgumentException($"Item '{line.ProductId}' has invalid quantity: {line.Quantity}");
            }

            var product = await _productRepository.GetByIdAsync(line.ProductId)
                ?? throw new ArgumentException($"Product with ID {line.ProductId} not found");

            // Same resolution the cart uses (catalog price, temperature-adjusted).
            var unitPrice = line.Temperature switch
            {
                Temperature.Hot => product.HotPrice ?? product.Price,
                Temperature.Cold => product.ColdPrice ?? product.Price,
                _ => product.Price
            };

            // Add-on whitelist: price is the catalog's, never the client's.
            var addOns = new List<AddOn>();
            var addOnsPerUnit = 0m;
            if (line.AddOns != null && line.AddOns.Count > 0)
            {
                var catalog = product.AddOns ?? new List<AddOnDto>();
                foreach (var requested in line.AddOns)
                {
                    var configured = catalog.FirstOrDefault(a =>
                        string.Equals(a.Name, requested.Name?.Trim(), StringComparison.Ordinal));
                    if (configured == null)
                    {
                        throw new ArgumentException(
                            $"Add-on '{requested.Name}' is not configured for product '{product.Name}'. " +
                            "The sale was rejected so an unpriced item cannot reach the receipt.");
                    }

                    var addOnQuantity = requested.Quantity < 1 ? 1 : requested.Quantity;
                    if (addOnQuantity > 20)
                    {
                        throw new ArgumentException(
                            $"{product.Name}: add-on quantity {addOnQuantity} is not a plausible per-unit count");
                    }

                    addOns.Add(new AddOn { Name = configured.Name, Price = configured.Price, Quantity = addOnQuantity });
                    addOnsPerUnit += configured.Price * addOnQuantity;
                }
            }

            var discount = line.Discount;
            if (discount != null)
            {
                var lineGross = (unitPrice + addOnsPerUnit) * line.Quantity;
                if (discount.Amount <= 0 && discount.Percentage > 0)
                {
                    // Percentage-only discount: the amount is derived, not ignored.
                    discount.Amount = Math.Round(lineGross * discount.Percentage / 100m, 2, MidpointRounding.AwayFromZero);
                }
                if (discount.Amount < 0 || discount.Amount > lineGross)
                {
                    throw new ArgumentException(
                        $"{product.Name}: line discount {discount.Amount:0.00} exceeds the line amount {lineGross:0.00}");
                }
                if (discount.Amount == 0 && discount.Percentage == 0)
                {
                    discount = null;
                }
            }

            transaction.Items.Add(new TransactionItem
            {
                ProductId = product.Id,
                Name = product.Name,
                Category = product.Category,
                Price = unitPrice + addOnsPerUnit,
                BasePrice = product.Price,
                Temperature = line.Temperature,
                Quantity = line.Quantity,
                AddOns = addOns,
                Discount = discount
            });
        }

        return transaction;
    }

    /// <summary>
    /// MySQL reports lock deadlocks (error 1213) and lock-wait timeouts (error 1205)
    /// as retryable serialization losses: the whole transaction was rolled back, so a
    /// retry sees the winner's committed state and re-evaluates from scratch.
    /// </summary>
    private static bool IsTransientLockFailure(Exception? ex)
    {
        for (var current = ex; current != null; current = current.InnerException)
        {
            if (current is MySqlException { Number: 1213 or 1205 })
                return true;

            var message = current.Message;
            if (message != null &&
                (message.Contains("deadlock found", StringComparison.OrdinalIgnoreCase) ||
                 message.Contains("lock wait timeout", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Canonical description of what the caller is being charged for: each line as
    /// product/quantity/price/temperature plus its add-ons and discount, and the
    /// service fee. Only client-driven charge inputs participate — Total is server
    /// derived and AmountReceived is change math, so neither can veto a replay.
    /// </summary>
    private static string BuildPayloadFingerprint(Transaction transaction)
    {
        var lines = transaction.Items
            .OrderBy(i => i.ProductId, StringComparer.Ordinal)
            .ThenBy(i => (int)i.Temperature)
            .Select(i =>
            {
                var addOns = (i.AddOns ?? new List<AddOn>())
                    .OrderBy(a => a.Name, StringComparer.Ordinal)
                    .Select(a => $"+{a.Name}:{a.Quantity}:{a.Price:0.00}");
                var discount = i.Discount == null ? "" : $"/disc:{i.Discount.Amount:0.00}";
                return $"{i.ProductId}:{i.Quantity}:{i.Price:0.00}:t{(int)i.Temperature}{discount}{string.Join("", addOns)}";
            });

        return $"fee:{transaction.ServiceFee:0.00};items:{string.Join("|", lines)}";
    }

    /// <summary>
    /// A key may only return the sale it was originally issued for. Same key + same
    /// payload is the expected retry; same key + different payload is client misuse
    /// and must never silently overwrite or alias the stored sale.
    /// </summary>
    private static Transaction EnsureSamePayloadOrConflict(Transaction stored, Transaction incoming)
    {
        if (!string.Equals(BuildPayloadFingerprint(stored), BuildPayloadFingerprint(incoming), StringComparison.Ordinal))
        {
            throw new IdempotencyKeyConflictException(
                $"An idempotency key already belongs to transaction #{stored.Id} with a different order. " +
                "Use a new idempotency key for a different sale.",
                stored.Id);
        }

        return stored;
    }

    /// <summary>
    /// Duplicate-key detection across providers: MySQL reports error 1062 with a
    /// "Duplicate entry" message, SQLite says "UNIQUE constraint failed", and the EF
    /// InMemory store phrases it as a unique-constraint failure too.
    /// </summary>
    private static bool IsDuplicateKeyError(DbUpdateException ex)
    {
        var message = (ex.InnerException?.Message ?? ex.Message);
        return message.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
            || message.Contains("unique constraint", StringComparison.OrdinalIgnoreCase)
            || message.Contains("unique index", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<IEnumerable<Transaction>> GetTransactionsByDateAsync(DateTime date)
    {
        // `date` is a Philippine business day (wall date). Convert once, here, so the
        // repository sees the exact UTC half-open window that covers the day — the
        // old day-snapping filed PH-morning sales into the previous bucket (OT-01).
        var (startUtc, endUtcExclusive) = PhilippineTime.DayUtc(date);
        return await _transactionRepository.GetByDateRangeAsync(startUtc, endUtcExclusive);
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
