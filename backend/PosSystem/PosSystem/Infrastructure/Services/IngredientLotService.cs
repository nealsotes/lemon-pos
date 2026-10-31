using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.Infrastructure.Services;

public class IngredientLotService : IIngredientLotService
{
    private readonly IIngredientLotRepository _lotRepository;
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IStockMovementRepository _movementRepository;
    private readonly PosSystemDbContext _context;

    public IngredientLotService(
        IIngredientLotRepository lotRepository,
        IIngredientRepository ingredientRepository,
        IStockMovementRepository movementRepository,
        PosSystemDbContext context)
    {
        _lotRepository = lotRepository;
        _ingredientRepository = ingredientRepository;
        _movementRepository = movementRepository;
        _context = context;
    }

    public async Task<IEnumerable<IngredientLot>> GetLotsAsync(string ingredientId)
    {
        return await _lotRepository.GetActiveByIngredientIdAsync(ingredientId);
    }

    public async Task<IngredientLot?> GetLotByIdAsync(string ingredientId, string lotId)
    {
        var lot = await _lotRepository.GetByIdAsync(lotId);
        if (lot == null || lot.IngredientId != ingredientId)
            return null;
        return lot;
    }

    public async Task<IngredientLot> CreateLotAsync(string ingredientId, IngredientLotDto dto)
    {
        var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
        if (ingredient == null)
            throw new ArgumentException($"Ingredient with ID {ingredientId} not found");

        if (dto.Quantity <= 0)
            throw new ArgumentException("Lot quantity must be greater than zero");

        var lot = new IngredientLot
        {
            IngredientId = ingredientId,
            Supplier = dto.Supplier,
            UnitCost = dto.UnitCost,
            InitialQuantity = dto.Quantity,
            RemainingQuantity = dto.Quantity,
            ExpirationDate = dto.ExpirationDate,
            LotNumber = dto.LotNumber,
            Notes = dto.Notes,
            ReceivedAt = DateTime.UtcNow,
            IsActive = true
        };

        var createdLot = await _lotRepository.AddAsync(lot);

        // Create stock movement for the purchase
        var movement = new StockMovement
        {
            Id = Guid.NewGuid().ToString(),
            IngredientId = ingredientId,
            MovementType = MovementType.Purchase,
            Quantity = dto.Quantity,
            UnitCost = dto.UnitCost,
            LotId = createdLot.Id,
            Reason = "Purchase",
            Notes = $"Lot received: {dto.Quantity} units from {dto.Supplier ?? "unknown"} at {dto.UnitCost:F2}/unit",
            CreatedAt = DateTime.UtcNow
        };
        await _movementRepository.AddAsync(movement);

        await SyncIngredientAggregatesAsync(ingredientId);

        return createdLot;
    }

    public async Task<IngredientLot> UpdateLotAsync(string ingredientId, string lotId, IngredientLotUpdateDto dto)
    {
        var lot = await _lotRepository.GetByIdAsync(lotId);
        if (lot == null || lot.IngredientId != ingredientId)
            throw new ArgumentException($"Lot with ID {lotId} not found for ingredient {ingredientId}");

        lot.Supplier = dto.Supplier ?? lot.Supplier;
        lot.ExpirationDate = dto.ExpirationDate ?? lot.ExpirationDate;
        lot.LotNumber = dto.LotNumber ?? lot.LotNumber;
        lot.Notes = dto.Notes ?? lot.Notes;

        var updated = await _lotRepository.UpdateAsync(lot);
        await SyncIngredientAggregatesAsync(ingredientId);

        return updated;
    }

    public async Task<List<StockMovement>> DeductFifoAsync(string ingredientId, decimal quantity, MovementType movementType, string? reason = null, string? notes = null)
    {
        if (quantity <= 0)
            throw new ArgumentException("Deduction quantity must be greater than zero");

        // The old implementation was check-then-act: it read the lots, checked the
        // balance, then wrote decrements derived from that stale read. Two concurrent
        // sales could both pass the availability check and both apply decrements
        // computed from the same RemainingQuantity, silently double-spending a lot and
        // leaving the ledger, the lots, and the ingredient's aggregate quantity
        // disagreeing with each other. The sweep is now transactional: it enlists in
        // the caller's transaction when one is open (the sale path wraps everything in
        // a unit-of-work transaction), opens its own when there is none, and only ever
        // decrements through an atomic conditional UPDATE (SELECT-side row scanning is
        // deliberately NOT lock-extended: verifying against the InnoDB deadlock graph,
        // next-key range locks on the lot index cycled against the guarded updates;
        // the guard itself carries correctness - a decrement never lands unless that
        // lot still holds enough, and the sweep re-reads candidates that lost a race).
        var isRelational = _context.Database.IsRelational();
        var currentTx = isRelational ? _context.Database.CurrentTransaction : null;

        // Lock deadlocks and lock-wait timeouts roll the victim back wholesale, so a
        // sweep that loses a serialization race reruns from a clean tracker (bounded
        // attempts). Only when we own the transaction: a caller-owned one (the sale
        // path) rolls back and retries at the caller level.
        const int maxLockRetries = 2;
        for (var attempt = 1; ; attempt++)
        {
            if (isRelational && currentTx == null)
                await _context.Database.BeginTransactionAsync();

            var ownTx = isRelational && currentTx == null;
            try
            {
                var lots = isRelational
                    ? (await LoadFifoCandidatesAsync(ingredientId)).ToList()
                    : (await _lotRepository.GetFifoLotsAsync(ingredientId)).ToList();

                var totalAvailable = lots.Sum(l => l.RemainingQuantity);

                if (totalAvailable < quantity)
                {
                    var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
                    throw new InvalidOperationException(
                        $"Insufficient stock for {ingredient?.Name ?? ingredientId}. Required: {quantity}, Available: {totalAvailable}");
                }

                var remaining = quantity;
                var movements = new List<StockMovement>();

                foreach (var lot in lots)
                {
                    var lotAttempts = 0;
                    while (remaining > 0)
                    {
                        var deduct = Math.Min(lot.RemainingQuantity, remaining);
                        if (deduct <= 0)
                            break;

                        if (++lotAttempts > 50)
                        {
                            // A concurrent top-up keeps refreshing this lot's balance;
                            // give up on this lot rather than spinning indefinitely.
                            break;
                        }

                        if (isRelational)
                        {
                            // Atomic compare-and-decrement: succeeds only while the lot
                            // still holds `deduct` units, and deactivates it when it
                            // drains, all in one statement. This row-level guarded write
                            // is the lock that serializes concurrent sweeps; zero rows
                            // means the lot changed under us - re-read its balance and
                            // either retry with the smaller remaining or move on.
                            var rows = await TryDecrementLotAtomicallyAsync(lot.Id, deduct);
                            if (rows == 0)
                            {
                                var fresh = (await _lotRepository.GetByIdAsync(lot.Id))?.RemainingQuantity ?? 0;
                                lot.RemainingQuantity = Math.Max(fresh, 0);
                                if (fresh > 0)
                                    continue;
                                break;
                            }

                            // Bookkeeping only - the database row is already updated.
                            lot.RemainingQuantity -= deduct;
                        }
                        else
                        {
                            // Non-relational stores (test harnesses, no row locks): same
                            // semantics as before, applied within the same logical sweep.
                            lot.RemainingQuantity -= deduct;
                            if (lot.RemainingQuantity <= 0)
                            {
                                lot.RemainingQuantity = 0;
                                lot.IsActive = false;
                            }
                            await _lotRepository.UpdateAsync(lot);
                        }

                        var movement = new StockMovement
                        {
                            Id = Guid.NewGuid().ToString(),
                            IngredientId = ingredientId,
                            MovementType = movementType,
                            Quantity = -deduct,
                            UnitCost = lot.UnitCost,
                            LotId = lot.Id,
                            Reason = reason ?? movementType.ToString(),
                            Notes = notes ?? $"Deducted {deduct} from lot {lot.LotNumber ?? (lot.Id.Length >= 8 ? lot.Id[..8] : lot.Id)} ({lot.Supplier ?? "unknown"})",
                            CreatedAt = DateTime.UtcNow
                        };
                        await _movementRepository.AddAsync(movement);
                        movements.Add(movement);

                        remaining -= deduct;
                    }

                    if (remaining <= 0)
                        break;
                }

                if (remaining > 0)
                {
                    // Concurrent writers drained the candidate lots mid-sweep. Nothing
                    // has been allowed to persist in a usable form: the catch below
                    // rolls the whole sweep back when we own the transaction.
                    var currentAvailable = (await _lotRepository.GetFifoLotsAsync(ingredientId)).Sum(l => l.RemainingQuantity);
                    var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
                    throw new InvalidOperationException(
                        $"Insufficient stock for {ingredient?.Name ?? ingredientId}. Required: {quantity}, Available: {currentAvailable}");
                }

                await SyncIngredientAggregatesAsync(ingredientId);

                if (ownTx)
                    await _context.Database.CommitTransactionAsync();

                return movements;
            }
            catch (Exception ex) when (ownTx && IsTransientLockFailure(ex) && attempt <= maxLockRetries)
            {
                // Deadlock/lock-wait victim: the server aborted this transaction. Drop
                // stale tracked entities and rerun the whole sweep on a fresh one.
                await _context.Database.RollbackTransactionAsync();
                _context.ChangeTracker.Clear();
            }
            catch
            {
                if (ownTx)
                {
                    try
                    {
                        await _context.Database.RollbackTransactionAsync();
                    }
                    catch
                    {
                        // Connection already aborted - nothing left to roll back.
                    }
                }
                throw;
            }
        }
    }

    /// <summary>
    /// MySQL reports lock deadlocks (error 1213) and lock-wait timeouts (error 1205)
    /// as retryable serialization losses: the victim transaction was rolled back whole,
    /// so a retry sees the winner's committed state and re-evaluates from scratch.
    /// </summary>
    private static bool IsTransientLockFailure(Exception? ex)
    {
        for (var current = ex; current != null; current = current.InnerException)
        {
            if (current is MySqlConnector.MySqlException { Number: 1213 or 1205 })
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
    /// FIFO candidates read WITHOUT tracking so the sweep's own guarded updates cannot
    /// be shadowed by stale tracked instances. Deliberately not FOR UPDATE: range
    /// next-key locks on the lot index deadlocked against the guarded updates under
    /// concurrent sweeps; the atomic guard is the lock and the truth.
    /// </summary>
    private async Task<IEnumerable<IngredientLot>> LoadFifoCandidatesAsync(string ingredientId)
    {
        return await _context.IngredientLots
            .FromSqlRaw(
                "SELECT * FROM IngredientLots " +
                "WHERE IngredientId = {0} AND IsActive = 1 AND RemainingQuantity > 0 " +
                "ORDER BY ReceivedAt ASC, (ExpirationDate IS NULL) ASC, ExpirationDate ASC",
                ingredientId)
            .AsNoTracking()
            .ToListAsync();
    }

    private Task<int> TryDecrementLotAtomicallyAsync(string lotId, decimal amount)
    {
        return _context.Database.ExecuteSqlRawAsync(
            "UPDATE IngredientLots " +
            "SET RemainingQuantity = RemainingQuantity - {0}, " +
            "    IsActive = CASE WHEN RemainingQuantity - {0} <= 0 THEN 0 ELSE 1 END " +
            "WHERE Id = {1} AND RemainingQuantity >= {0}",
            amount, lotId);
    }

    public async Task SyncIngredientAggregatesAsync(string ingredientId)
    {
        var ingredient = await _ingredientRepository.GetByIdAsync(ingredientId);
        if (ingredient == null) return;

        var lots = (await _lotRepository.GetActiveByIngredientIdAsync(ingredientId)).ToList();

        // Quantity = sum of remaining
        ingredient.Quantity = lots.Sum(l => l.RemainingQuantity);

        // Weighted average unit cost
        var totalValue = lots.Sum(l => l.RemainingQuantity * l.UnitCost);
        ingredient.UnitCost = ingredient.Quantity > 0
            ? Math.Round(totalValue / ingredient.Quantity, 2)
            : ingredient.UnitCost;

        // Supplier = most recently received lot
        var newestLot = lots.OrderByDescending(l => l.ReceivedAt).FirstOrDefault();
        if (newestLot != null)
        {
            ingredient.Supplier = newestLot.Supplier;
            ingredient.LastPurchaseDate = newestLot.ReceivedAt;
            ingredient.LastPurchaseCost = newestLot.UnitCost;
        }

        // Expiration = earliest non-null expiration
        ingredient.ExpirationDate = lots
            .Where(l => l.ExpirationDate.HasValue)
            .OrderBy(l => l.ExpirationDate)
            .FirstOrDefault()?.ExpirationDate;

        ingredient.UpdatedAt = DateTime.UtcNow;
        await _ingredientRepository.UpdateAsync(ingredient);
    }

    public async Task<Dictionary<string, decimal>> GetFifoCostsAsync()
    {
        var allIngredients = await _ingredientRepository.GetAllAsync();
        var result = new Dictionary<string, decimal>();

        foreach (var ingredient in allIngredients)
        {
            // Try oldest active lot first (true FIFO cost)
            var oldestActive = await _lotRepository.GetOldestActiveLotAsync(ingredient.Id);
            if (oldestActive != null)
            {
                result[ingredient.Id] = oldestActive.UnitCost;
                continue;
            }

            // Fall back to most recent lot (even if depleted)
            var mostRecent = await _lotRepository.GetMostRecentLotAsync(ingredient.Id);
            if (mostRecent != null)
            {
                result[ingredient.Id] = mostRecent.UnitCost;
            }
            // If no lots at all, omit — frontend falls back to ingredient.unitCost
        }

        return result;
    }
}
