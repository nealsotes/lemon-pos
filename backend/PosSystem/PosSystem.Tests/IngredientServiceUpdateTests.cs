using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// TA-02 regression tests + the stock-ledger routing contract for ingredient
/// updates. Historically, UpdateIngredientAsync committed the ingredient row first
/// and then (for a unit-cost-only change) built a zero-quantity StockMovement, which
/// StockMovementService rejected ("Quantity cannot be zero") — every cost-only PUT
/// returned 400 AFTER the row was already committed (broken feature + partial
/// write).
///
/// The contract pinned here (post ledger-routing fix):
///  - a cost-only change SUCCEEDS and touches NO stock movement and NO lot (the new
///    cost is recorded on the ingredient row itself);
///  - a quantity change routes THROUGH IIngredientLotService — a Purchase lot
///    receipt on increase (lot service books the Purchase movement), an Adjustment
///    FIFO deduction on decrease — with NO service-level movement write (the lot
///    service's movements ARE the ledger; a second writer would double-book);
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

    /// <summary>
    /// Mirrors what the real IngredientLotService does to the tracked row when a lot
    /// is received or deducted: each lot op books its movement and syncs the
    /// aggregates, so Quantity ends at the sum of the active lots (here: the
    /// requested target).
    /// </summary>
    private void StubLotsAndSync(Ingredient existing, decimal lotTotal, decimal? target = null)
    {
        _lotService.Setup(l => l.GetLotsAsync("ing-1")).ReturnsAsync(
            lotTotal == 0m
                ? Array.Empty<IngredientLot>()
                : new[] { new IngredientLot { IngredientId = "ing-1", UnitCost = 10m, InitialQuantity = lotTotal, RemainingQuantity = lotTotal, ReceivedAt = DateTime.UtcNow, IsActive = true } });
        _lotService.Setup(l => l.CreateLotAsync("ing-1", It.IsAny<IngredientLotDto>()))
            .ReturnsAsync(new IngredientLot())
            .Callback(() => existing.Quantity = target ?? existing.Quantity);
        _lotService.Setup(l => l.DeductFifoAsync("ing-1", It.IsAny<decimal>(), It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ReturnsAsync(new List<StockMovement>())
            .Callback(() => existing.Quantity = target ?? existing.Quantity);
        _lotService.Setup(l => l.SyncIngredientAggregatesAsync("ing-1")).Returns(Task.CompletedTask)
            .Callback(() => existing.Quantity = target ?? existing.Quantity);
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
    public async Task UpdateAsync_QuantityAndCostChange_RoutesReceiptThroughLotServiceCarryingNewCost()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);
        StubLotsAndSync(existing, lotTotal: 10m, target: 14m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 14m, unitCost: 11m));

        // The +4 ledger gain rides a lot receipt carrying the edit's new cost;
        // no service-level movement write may double-book the ledger.
        _lotService.Verify(l => l.CreateLotAsync("ing-1", It.Is<IngredientLotDto>(d =>
            d.Quantity == 4m && d.UnitCost == 11m)), Times.Once);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_QuantityDecrease_RoutesFifoDeductionWithAbsoluteQuantity()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);
        StubLotsAndSync(existing, lotTotal: 10m, target: 7m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 7m, unitCost: 10m));

        _lotService.Verify(l => l.DeductFifoAsync("ing-1", 3m,
            MovementType.Adjustment, "Stock Edit", It.IsAny<string?>()), Times.Once);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_QuantityOnlyChange_LandsRequestedQuantityThroughLots()
    {
        var existing = ExistingIngredient(quantity: 10m, unitCost: 10m);
        SetupExisting(existing);
        StubLotsAndSync(existing, lotTotal: 10m, target: 12m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 12m, unitCost: 10m));

        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i => i.Quantity == 12m)), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync("ing-1", It.Is<IngredientLotDto>(d =>
            d.Quantity == 2m && d.UnitCost == 10m)), Times.Once);
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