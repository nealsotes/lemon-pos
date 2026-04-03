using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class IngredientLotService : IIngredientLotService
{
    private readonly IIngredientLotRepository _lotRepository;
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IStockMovementRepository _movementRepository;

    public IngredientLotService(
        IIngredientLotRepository lotRepository,
        IIngredientRepository ingredientRepository,
        IStockMovementRepository movementRepository)
    {
        _lotRepository = lotRepository;
        _ingredientRepository = ingredientRepository;
        _movementRepository = movementRepository;
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

        var lots = (await _lotRepository.GetFifoLotsAsync(ingredientId)).ToList();
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
            if (remaining <= 0) break;

            var deduct = Math.Min(lot.RemainingQuantity, remaining);
            lot.RemainingQuantity -= deduct;

            if (lot.RemainingQuantity <= 0)
            {
                lot.RemainingQuantity = 0;
                lot.IsActive = false;
            }

            await _lotRepository.UpdateAsync(lot);

            var movement = new StockMovement
            {
                Id = Guid.NewGuid().ToString(),
                IngredientId = ingredientId,
                MovementType = movementType,
                Quantity = -deduct,
                UnitCost = lot.UnitCost,
                LotId = lot.Id,
                Reason = reason ?? movementType.ToString(),
                Notes = notes ?? $"Deducted {deduct} from lot {lot.LotNumber ?? lot.Id[..8]} ({lot.Supplier ?? "unknown"})",
                CreatedAt = DateTime.UtcNow
            };
            await _movementRepository.AddAsync(movement);
            movements.Add(movement);

            remaining -= deduct;
        }

        await SyncIngredientAggregatesAsync(ingredientId);

        return movements;
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
