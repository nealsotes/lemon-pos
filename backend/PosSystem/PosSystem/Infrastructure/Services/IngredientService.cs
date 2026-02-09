using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class IngredientService : IIngredientService
{
    private readonly IIngredientRepository _ingredientRepository;
    private readonly IStockMovementService _stockMovementService;

    public IngredientService(IIngredientRepository ingredientRepository, IStockMovementService stockMovementService)
    {
        _ingredientRepository = ingredientRepository;
        _stockMovementService = stockMovementService;
    }

    public async Task<IEnumerable<Ingredient>> GetAllIngredientsAsync()
    {
        return await _ingredientRepository.GetAllAsync();
    }

    public async Task<Ingredient?> GetIngredientByIdAsync(string id)
    {
        return await _ingredientRepository.GetByIdAsync(id);
    }

    public async Task<Ingredient> CreateIngredientAsync(Ingredient ingredient)
    {
        if (string.IsNullOrWhiteSpace(ingredient.Id))
        {
            ingredient.Id = Guid.NewGuid().ToString();
        }

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

    public async Task<Ingredient> UpdateIngredientAsync(string id, Ingredient ingredient)
    {
        var existingIngredient = await _ingredientRepository.GetByIdAsync(id);
        if (existingIngredient == null)
        {
            throw new ArgumentException($"Ingredient with ID {id} not found");
        }

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

        // Validate that quantity is a whole number for pieces
        if ((ingredient.Unit.ToLower() == "pcs" || ingredient.Unit.ToLower() == "piece" || ingredient.Unit.ToLower() == "pieces") 
            && ingredient.Quantity % 1 != 0)
        {
            throw new ArgumentException("Quantity must be a whole number for pieces");
        }

        // Validate low stock threshold
        if (ingredient.LowStockThreshold < 0)
        {
            throw new ArgumentException("Low stock threshold cannot be negative");
        }

        // Validate that low stock threshold is a whole number for pieces
        if ((ingredient.Unit.ToLower() == "pcs" || ingredient.Unit.ToLower() == "piece" || ingredient.Unit.ToLower() == "pieces") 
            && ingredient.LowStockThreshold % 1 != 0)
        {
            throw new ArgumentException("Low stock threshold must be a whole number for pieces");
        }

        existingIngredient.Name = ingredient.Name;
        existingIngredient.Quantity = ingredient.Quantity;
        existingIngredient.Unit = ingredient.Unit;
        existingIngredient.Supplier = ingredient.Supplier;
        existingIngredient.ExpirationDate = ingredient.ExpirationDate;
        existingIngredient.LowStockThreshold = ingredient.LowStockThreshold;
        existingIngredient.UnitCost = ingredient.UnitCost;
        existingIngredient.LastPurchaseDate = ingredient.LastPurchaseDate;
        existingIngredient.LastPurchaseCost = ingredient.LastPurchaseCost;
        existingIngredient.UpdatedAt = DateTime.UtcNow;

        return await _ingredientRepository.UpdateAsync(existingIngredient);
    }

    public async Task DeleteIngredientAsync(string id)
    {
        await _ingredientRepository.DeleteAsync(id);
    }

    public async Task<IEnumerable<Ingredient>> GetLowStockIngredientsAsync(decimal threshold)
    {
        return await _ingredientRepository.GetLowStockAsync(threshold);
    }

    public async Task<Ingredient> AdjustQuantityAsync(string id, decimal adjustment)
    {
        var ingredient = await _ingredientRepository.GetByIdAsync(id);
        if (ingredient == null)
        {
            throw new ArgumentException($"Ingredient with ID {id} not found");
        }

        var newQuantity = ingredient.Quantity + adjustment;
        if (newQuantity < 0)
        {
            throw new ArgumentException($"Cannot reduce quantity below 0. Current quantity: {ingredient.Quantity}, Adjustment: {adjustment}");
        }

        var oldQuantity = ingredient.Quantity;
        ingredient.Quantity = newQuantity;
        ingredient.UpdatedAt = DateTime.UtcNow;

        var updatedIngredient = await _ingredientRepository.UpdateAsync(ingredient);

        // Create stock movement record
        var movementType = adjustment > 0 ? MovementType.Adjustment : MovementType.Adjustment;
        var stockMovement = new StockMovement
        {
            IngredientId = id,
            MovementType = movementType,
            Quantity = Math.Abs(adjustment),
            UnitCost = ingredient.UnitCost,
            Reason = adjustment > 0 ? "Quantity Increase" : "Quantity Decrease",
            Notes = $"Adjusted from {oldQuantity} to {newQuantity}"
        };

        await _stockMovementService.CreateMovementAsync(stockMovement);

        return updatedIngredient;
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

