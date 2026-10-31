using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// TA-02 regression tests for cost-only ingredient updates.
/// Historically, UpdateIngredientAsync committed the ingredient row first and then
/// (for a unit-cost-only change) built a zero-quantity StockMovement, which
/// StockMovementService rejected ("Quantity cannot be zero") — every cost-only
/// PUT returned 400 AFTER the row was already committed (broken feature + partial
/// write).
///
/// The contract pinned here:
///  - a cost-only change SUCCEEDS and creates NO stock movement (the new cost is
///    recorded on the ingredient row itself);
///  - a quantity change still creates exactly one movement (Purchase on increase,
///    Adjustment on decrease) carrying the non-zero |adjustment| and the new UnitCost;
///  - all input validation runs BEFORE the first save, so a rejected update never
///    leaves a half-applied row.
/// </summary>
public class IngredientServiceUpdateTests
{
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IStockMovementService> _stockMovementService = new();
    private readonly Mock<IIngredientLotService> _lotService = new();

    private IngredientService CreateService() => new(
        _ingredientRepository.Object,
        _stockMovementService.Object,
        _lotService.Object);

    private static Ingredient ExistingIngredient(decimal quantity = 10m, decimal? unitCost = 10m) => new()
    {
        Id = "ing-1",
        Name = "Milk",
        Quantity = quantity,
        Unit = "L",
        LowStockThreshold = 3m,
        UnitCost = unitCost,
        IsActive = true
    };

    private static IngredientDto Dto(decimal quantity, decimal? unitCost, string unit = "L", string name = "Milk") => new()
    {
        Name = name,
        Quantity = quantity,
        Unit = unit,
        LowStockThreshold = 3m,
        UnitCost = unitCost
    };

    private void SetupExisting(Ingredient existing)
    {
        _ingredientRepository.Setup(r => r.GetByIdAsync("ing-1")).ReturnsAsync(existing);
        _ingredientRepository.Setup(r => r.UpdateAsync(It.IsAny<Ingredient>())).ReturnsAsync(existing);
    }

    [Fact]
    public async Task UpdateAsync_CostOnlyChange_SucceedsWithoutStockMovement()
    {
        var existing = ExistingIngredient(unitCost: 10m);
        SetupExisting(existing);

        var result = await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 10m, unitCost: 12.5m));

        // The row commit still carries the new cost...
        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i => i.UnitCost == 12.5m)), Times.Once);
        Assert.Equal(12.5m, result.UnitCost);
        // ...and no zero-quantity movement may be attempted (the old 400-after-commit bug).
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_QuantityAndCostChange_CreatesSingleMovementCarryingNewCost()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 14m, unitCost: 11m));

        _stockMovementService.Verify(s => s.CreateMovementAsync(It.Is<StockMovement>(m =>
            m.IngredientId == "ing-1" &&
            m.MovementType == MovementType.Purchase &&
            m.Quantity == 4m &&
            m.UnitCost == 11m)), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_QuantityDecrease_CreatesAdjustmentMovementWithAbsoluteQuantity()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 7m, unitCost: 10m));

        _stockMovementService.Verify(s => s.CreateMovementAsync(It.Is<StockMovement>(m =>
            m.MovementType == MovementType.Adjustment &&
            m.Quantity == 3m)), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_QuantityOnlyChange_CreatesMovementWithoutCostChangeAttempt()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 12m, unitCost: 10m));

        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i => i.Quantity == 12m)), Times.Once);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.Is<StockMovement>(m =>
            m.Quantity == 2m && m.UnitCost == 10m)), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_InvalidQuantity_ThrowsBeforeAnySave()
    {
        // A rejected update must not leave a half-applied row: validation first.
        var existing = ExistingIngredient(quantity: 10m);
        _ingredientRepository.Setup(r => r.GetByIdAsync("ing-1")).ReturnsAsync(existing);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: -1m, unitCost: 12.5m)));

        _ingredientRepository.Verify(r => r.UpdateAsync(It.IsAny<Ingredient>()), Times.Never);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }
}