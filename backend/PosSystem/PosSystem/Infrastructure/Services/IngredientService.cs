using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class IngredientService : IIngredientService
{
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IStockMovementService _stockMovementService;
    private readonly IIngredientLotService _lotService;

    public IngredientService(IIngredientRepository ingredientRepository, IStockMovementService stockMovementService, IIngredientLotService lotService)
    {
        _ingredientRepository = ingredientRepository;
        _stockMovementService = stockMovementService;
        _lotService = lotService;
    }

    public async Task<IEnumerable<Ingredient>> GetAllIngredientsAsync()
    {
        return await _ingredientRepository.GetAllAsync();
    }

    public async Task<Ingredient?> GetIngredientByIdAsync(string id)
    {
        return await _ingredientRepository.GetByIdAsync(id);
    }

    public async Task<Ingredient> CreateIngredientAsync(IngredientDto ingredientDto)
    {
        var ingredient = new Ingredient
        {
            Id = Guid.NewGuid().ToString(),
            Name = ingredientDto.Name,
            Quantity = ingredientDto.Quantity,
            Unit = ingredientDto.Unit,
            Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? null : ingredientDto.Supplier,
            ExpirationDate = ingredientDto.ExpirationDate,
            LowStockThreshold = ingredientDto.LowStockThreshold,
            UnitCost = ingredientDto.UnitCost,
            LastPurchaseDate = ingredientDto.LastPurchaseDate,
            LastPurchaseCost = ingredientDto.LastPurchaseCost,
            IsActive = ingredientDto.IsActive
        };

        // Validate expiration date
        if (ingredient.ExpirationDate.HasValue && ingredient.ExpirationDate.Value < DateTime.UtcNow.Date)
        {
            throw new ArgumentException("Expiration date cannot be in the past");
        }

        // Validate quantity
        if (ingredient.Quantity < 0)
        {
            throw new ArgumentException("Quantity cannot be negative");
        }

        // Validate low stock threshold
        if (ingredient.LowStockThreshold < 0)
        {
            throw new ArgumentException("Low stock threshold cannot be negative");
        }

        ingredient.CreatedAt = DateTime.UtcNow;
        ingredient.UpdatedAt = DateTime.UtcNow;

        return await _ingredientRepository.AddAsync(ingredient);
    }

    public async Task<Ingredient> UpdateIngredientAsync(string id, IngredientDto ingredientDto)
    {
        var existingIngredient = await _ingredientRepository.GetByIdAsync(id);
        if (existingIngredient == null)
        {
            throw new ArgumentException($"Ingredient with ID {id} not found");
        }

        // Validate expiration date
        if (ingredientDto.ExpirationDate.HasValue && ingredientDto.ExpirationDate.Value < DateTime.UtcNow.Date)
        {
            throw new ArgumentException("Expiration date cannot be in the past");
        }

        // Validate quantity
        if (ingredientDto.Quantity < 0)
        {
            throw new ArgumentException("Quantity cannot be negative");
        }

        // Validate that quantity is a whole number for pieces
        if ((ingredientDto.Unit.ToLower() == "pcs" || ingredientDto.Unit.ToLower() == "piece" || ingredientDto.Unit.ToLower() == "pieces")
            && ingredientDto.Quantity % 1 != 0)
        {
            throw new ArgumentException("Quantity must be a whole number for pieces");
        }

        // Validate low stock threshold
        if (ingredientDto.LowStockThreshold < 0)
        {
            throw new ArgumentException("Low stock threshold cannot be negative");
        }

        // Validate that low stock threshold is a whole number for pieces
        if ((ingredientDto.Unit.ToLower() == "pcs" || ingredientDto.Unit.ToLower() == "piece" || ingredientDto.Unit.ToLower() == "pieces")
            && ingredientDto.LowStockThreshold % 1 != 0)
        {
            throw new ArgumentException("Low stock threshold must be a whole number for pieces");
        }

        var oldQuantity = existingIngredient.Quantity;
        var oldUnitCost = existingIngredient.UnitCost;

        existingIngredient.Name = ingredientDto.Name;
        existingIngredient.Quantity = ingredientDto.Quantity;
        existingIngredient.Unit = ingredientDto.Unit;
        existingIngredient.Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? null : ingredientDto.Supplier;
        existingIngredient.ExpirationDate = ingredientDto.ExpirationDate;
        existingIngredient.LowStockThreshold = ingredientDto.LowStockThreshold;
        existingIngredient.UnitCost = ingredientDto.UnitCost;
        existingIngredient.LastPurchaseDate = ingredientDto.LastPurchaseDate;
        existingIngredient.LastPurchaseCost = ingredientDto.LastPurchaseCost;
        existingIngredient.UpdatedAt = DateTime.UtcNow;

        var updatedIngredient = await _ingredientRepository.UpdateAsync(existingIngredient);

        // Create stock movement for quantity or unit cost changes
        var quantityChanged = oldQuantity != ingredientDto.Quantity;
        var unitCostChanged = oldUnitCost != ingredientDto.UnitCost;

        if (quantityChanged)
        {
            var adjustment = ingredientDto.Quantity - oldQuantity;
            var stockMovement = new StockMovement
            {
                IngredientId = id,
                MovementType = adjustment > 0 ? MovementType.Purchase : MovementType.Adjustment,
                Quantity = Math.Abs(adjustment),
                UnitCost = ingredientDto.UnitCost,
                Reason = adjustment > 0 ? "Quantity Increase" : "Quantity Decrease",
                Notes = $"Updated from {oldQuantity} to {ingredientDto.Quantity}"
            };
            await _stockMovementService.CreateMovementAsync(stockMovement);
        }

        if (unitCostChanged)
        {
            var stockMovement = new StockMovement
            {
                IngredientId = id,
                MovementType = MovementType.Adjustment,
                Quantity = 0,
                UnitCost = ingredientDto.UnitCost,
                Reason = "Unit Cost Update",
                Notes = $"Unit cost changed from {oldUnitCost:F2} to {ingredientDto.UnitCost:F2}"
            };
            await _stockMovementService.CreateMovementAsync(stockMovement);
        }

        return updatedIngredient;
    }

    public async Task DeleteIngredientAsync(string id)
    {
        await _ingredientRepository.DeleteAsync(id);
    }

    public async Task<IEnumerable<Ingredient>> GetLowStockIngredientsAsync(decimal threshold)
    {
        return await _ingredientRepository.GetLowStockAsync(threshold);
    }

    public async Task<Ingredient> AdjustQuantityAsync(string id, decimal adjustment, string? movementType = null, string? reason = null, string? notes = null, string? supplier = null, decimal? unitCost = null, DateTime? expirationDate = null, string? lotNumber = null)
    {
        var ingredient = await _ingredientRepository.GetByIdAsync(id);
        if (ingredient == null)
        {
            throw new ArgumentException($"Ingredient with ID {id} not found");
        }

        // Resolve movement type
        var resolvedType = MovementType.Adjustment;
        if (!string.IsNullOrEmpty(movementType) && Enum.TryParse<MovementType>(movementType, true, out var parsed))
        {
            resolvedType = parsed;
        }
        else
        {
            resolvedType = adjustment > 0 ? MovementType.Purchase : MovementType.Adjustment;
        }

        if (adjustment > 0)
        {
            // Incoming stock: create a new lot with provided or default values
            var dto = new IngredientLotDto
            {
                Supplier = supplier ?? ingredient.Supplier,
                UnitCost = unitCost ?? ingredient.UnitCost ?? 0,
                Quantity = adjustment,
                ExpirationDate = expirationDate,
                LotNumber = lotNumber,
                Notes = notes
            };
            await _lotService.CreateLotAsync(id, dto);
        }
        else
        {
            // Outgoing stock: FIFO deduction from existing lots
            var deductAmount = Math.Abs(adjustment);
            await _lotService.DeductFifoAsync(id, deductAmount, resolvedType, reason, notes);
        }

        // Return the updated ingredient (aggregates already synced by lot service)
        return (await _ingredientRepository.GetByIdAsync(id))!;
    }

    public async Task<IEnumerable<Ingredient>> GetReorderSuggestionsAsync()
    {
        var allIngredients = await _ingredientRepository.GetAllAsync();
        return allIngredients
            .Where(i => i.Quantity <= i.LowStockThreshold)
            .OrderBy(i => i.Quantity / i.LowStockThreshold) // Sort by how low they are
            .ToList();
    }

    public async Task<InventoryValueReport> GetInventoryValueAsync()
    {
        var allIngredients = await _ingredientRepository.GetAllAsync();
        
        var totalValue = allIngredients
            .Where(i => i.UnitCost.HasValue)
            .Sum(i => (i.UnitCost ?? 0) * i.Quantity);

        var valueBySupplier = allIngredients
            .Where(i => i.UnitCost.HasValue)
            .GroupBy(i => i.Supplier ?? "Unknown")
            .Select(g => new SupplierValue
            {
                Supplier = g.Key,
                TotalValue = g.Sum(i => (i.UnitCost ?? 0) * i.Quantity),
                ItemCount = g.Count()
            })
            .OrderByDescending(s => s.TotalValue)
            .ToList();

        return new InventoryValueReport
        {
            TotalValue = totalValue,
            TotalItems = allIngredients.Count(),
            ValueBySupplier = valueBySupplier
        };
    }
}

