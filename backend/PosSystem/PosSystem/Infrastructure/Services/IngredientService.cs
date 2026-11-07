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

        var created = await _ingredientRepository.AddAsync(ingredient);

        // Stock-ledger desync fix (LPOS-SL-01): a create with quantity > 0 also
        // seeds the initial FIFO lot, so imported/created stock is immediately
        // sellable through recipes. The lot service books the Purchase receipt and
        // syncs the row aggregates (Quantity ends as the sum of the lots - the
        // requested value for a fresh row). Creates must not hand-write their own
        // StockMovement: the lot receipt IS the ledger entry.
        if (created.Quantity > 0)
        {
            await _lotService.CreateLotAsync(created.Id, new IngredientLotDto
            {
                Supplier = created.Supplier,
                UnitCost = created.UnitCost ?? 0m,
                Quantity = ingredientDto.Quantity,
                ExpirationDate = ingredientDto.ExpirationDate
            });
        }

        return await _ingredientRepository.GetByIdAsync(created.Id) ?? created;
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

        // Stock-ledger desync fix (LPOS-SL-01): quantity changes route through the
        // FIFO lot service exactly like AdjustQuantityAsync does, instead of writing
        // the row quantity directly (which left row and lots permanently disagreed,
        // making edit/import-created stock unsellable through recipes). The edit
        // target is ABSOLUTE: the lot-side delta is the requested quantity minus the
        // active-lot total, so any successful quantity edit lands
        // row == lots == the requested value - for an already-synced row this is the
        // same difference the operator typed, and for a legacy desynced row the edit
        // self-heals the drift. Uncovered decreases (ledger holds less than the
        // edit would remove) throw from the lot service BEFORE any row save: no
        // half-applied updates. Legacy rows whose lots cannot cover the change are
        // reconciled with Adjust Stock or a stock import (see the desync report).
        // The lot service books the audit movements itself (Purchase on receipt,
        // negative Adjustment rows per deducted lot), so no second movement write
        // may happen here - a service-level write would double-book the ledger.
        if (existingIngredient.Quantity != ingredientDto.Quantity)
        {
            var activeLotTotal = (await _lotService.GetLotsAsync(id))
                .Where(l => l.RemainingQuantity > 0)
                .Sum(l => l.RemainingQuantity);
            var lotDelta = ingredientDto.Quantity - activeLotTotal;

            if (lotDelta > 0)
            {
                // Incoming stock: a new lot with the edit's supplier/cost mapping.
                await _lotService.CreateLotAsync(id, new IngredientLotDto
                {
                    Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? existingIngredient.Supplier : ingredientDto.Supplier,
                    UnitCost = ingredientDto.UnitCost ?? existingIngredient.UnitCost ?? 0m,
                    Quantity = lotDelta,
                    ExpirationDate = ingredientDto.ExpirationDate,
                    Notes = $"Stock edit: set to {ingredientDto.Quantity}"
                });
            }
            else if (lotDelta < 0)
            {
                // Outgoing stock: FIFO deduction, recorded on the ledger by the
                // lot service's own Adjustment movements.
                await _lotService.DeductFifoAsync(id, -lotDelta, MovementType.Adjustment, "Stock Edit");
            }

            // The lot ops sync the row aggregates; when the ledger already matched
            // the request but the row had drifted, resync the stale row instead of
            // quietly keeping its stale quantity.
            if (lotDelta == 0)
            {
                await _lotService.SyncIngredientAggregatesAsync(id);
            }
        }

        existingIngredient.Name = ingredientDto.Name;
        // Quantity stays ledger-owned: the lot ops (and their aggregate sync) have
        // already set it to the sum of the active lots, which equals the requested
        // value whenever the edit succeeded.
        existingIngredient.Unit = ingredientDto.Unit;
        existingIngredient.Supplier = string.IsNullOrWhiteSpace(ingredientDto.Supplier) ? null : ingredientDto.Supplier;
        existingIngredient.ExpirationDate = ingredientDto.ExpirationDate;
        existingIngredient.LowStockThreshold = ingredientDto.LowStockThreshold;
        existingIngredient.UnitCost = ingredientDto.UnitCost;
        existingIngredient.LastPurchaseDate = ingredientDto.LastPurchaseDate;
        existingIngredient.LastPurchaseCost = ingredientDto.LastPurchaseCost;
        existingIngredient.UpdatedAt = DateTime.UtcNow;

        // TA-02: a cost-only change never touches the StockMovementService - the old
        // zero-quantity movement ("Quantity cannot be zero") was rejected by
        // StockMovementService AFTER the ingredient row had already been committed,
        // so every cost-only PUT failed on a half-applied update. The new cost is
        // recorded on the ingredient row itself. In the lot-routed world a quantity
        // change books its movements through the lot service (above), so there is
        // no movement write left on this path at all - the service cannot 400 after
        // a partial write.
        var updatedIngredient = await _ingredientRepository.UpdateAsync(existingIngredient);

        return updatedIngredient;
    }

    public async Task DeleteIngredientAsync(string id)
    {
        await _ingredientRepository.DeleteAsync(id);
    }

    public async Task<int> DeleteIngredientsBulkAsync(IEnumerable<string> ids)
    {
        return await _ingredientRepository.DeleteBulkAsync(ids);
    }

    public async Task<IEnumerable<IngredientLedgerDesync>> GetLedgerDesyncsAsync()
    {
        return await _ingredientRepository.GetLedgerDesyncsAsync();
    }

    public async Task<IEnumerable<Ingredient>> GetLowStockIngredientsAsync()
    {
        return await _ingredientRepository.GetLowStockAsync();
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

