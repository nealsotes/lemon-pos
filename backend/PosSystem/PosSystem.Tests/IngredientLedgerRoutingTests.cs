using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// Routing contract for IngredientService quantity mutations (stock-ledger desync fix).
/// An edit or import that changes quantity must route through IIngredientLotService
/// exactly like AdjustQuantityAsync does — create on increase, FIFO deduction on
/// decrease — and must NOT hand-write its own StockMovement (the lot service's
/// Purchase/deduction movements ARE the ledger; a second writer would double-book).
///
/// Quantity targets are ABSOLUTE: the lot-side delta is dto.Quantity minus the
/// active-lot total, so any successful quantity edit lands row == lots == the
/// requested value, which self-heals legacy rows whose row quantity had drifted
/// from the ledger. The row is committed only after the lot operation succeeds, so
/// an uncovered decrease never leaves a half-applied edit.
/// </summary>
public class IngredientLedgerRoutingTests
{
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IStockMovementService> _stockMovementService = new();
    private readonly Mock<IIngredientLotService> _lotService = new();

    private IngredientService CreateService() => new(
        _ingredientRepository.Object,
        _stockMovementService.Object,
        _lotService.Object);

    private static Ingredient Row(decimal quantity = 0m, decimal? unitCost = 10m, string name = "Milk") => new()
    {
        Id = "ing-1",
        Name = name,
        Quantity = quantity,
        Unit = "L",
        LowStockThreshold = 3m,
        UnitCost = unitCost,
        Supplier = "Old Supplier",
        IsActive = true
    };

    private static IngredientDto Dto(decimal quantity, decimal? unitCost = 10m, string? supplier = "New Supplier") => new()
    {
        Name = "Milk",
        Quantity = quantity,
        Unit = "L",
        Supplier = supplier,
        LowStockThreshold = 3m,
        UnitCost = unitCost
    };

    private static IngredientLot Lot(decimal remaining, string id = "lot-1") => new()
    {
        Id = id,
        IngredientId = "ing-1",
        UnitCost = 10m,
        InitialQuantity = remaining,
        RemainingQuantity = remaining,
        ReceivedAt = DateTime.UtcNow,
        IsActive = true
    };

    private void SetupRow(Ingredient existing)
    {
        _ingredientRepository.Setup(r => r.GetByIdAsync("ing-1")).ReturnsAsync(existing);
        _ingredientRepository.Setup(r => r.UpdateAsync(It.IsAny<Ingredient>())).ReturnsAsync(existing);
    }

    private void SetupLots(decimal total)
    {
        _lotService.Setup(l => l.GetLotsAsync("ing-1"))
            .ReturnsAsync(total == 0m ? Array.Empty<IngredientLot>() : new[] { Lot(total) });
    }

    [Fact]
    public async Task UpdateAsync_Increase_RoutesThroughCreateLot_WithoutSecondMovementWriter()
    {
        // Import shape: the row was created with quantity 0 and has no lots; the
        // operator (or the importer) sets it to 3 — the delta must become a lot.
        var existing = Row(quantity: 0m);
        SetupRow(existing);
        SetupLots(0m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 3m));

        _lotService.Verify(l => l.CreateLotAsync("ing-1", It.Is<IngredientLotDto>(d =>
            d.Quantity == 3m &&
            d.Supplier == "New Supplier" &&
            d.UnitCost == 10m)), Times.Once);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
        // The lot service's movements ARE the ledger; the service must not double-book.
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_Decrease_RoutesThroughDeductFifo_WithStockEditReason()
    {
        var existing = Row(quantity: 10m);
        SetupRow(existing);
        SetupLots(10m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 7m));

        _lotService.Verify(l => l.DeductFifoAsync("ing-1", 3m,
            MovementType.Adjustment, "Stock Edit", It.IsAny<string?>()), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_TargetIsAbsolute_SelfHealsDesyncedRow()
    {
        // Legacy desync: the row claims 2 while the ledger holds 10. Requesting 5
        // must DEDUCT 5 from the lots (target semantics), not create +3 (row-delta
        // semantics) — the edit lands row == lots == 5, the requested amount.
        var existing = Row(quantity: 2m);
        SetupRow(existing);
        SetupLots(10m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 5m));

        _lotService.Verify(l => l.DeductFifoAsync("ing-1", 5m,
            MovementType.Adjustment, "Stock Edit", It.IsAny<string?>()), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_StaleHigherRow_LandsRequestedQuantity_RealigningLedgerUp()
    {
        // Legacy desync: row 10, ledger 2. Requesting 9 asks the LEDGER for 9 —
        // +7 on the lots (absolute-target semantics). The edit lands
        // row == lots == 9 exactly; the previously lying row quantity is realigned.
        var existing = Row(quantity: 10m);
        SetupRow(existing);
        SetupLots(2m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 9m, unitCost: 11m));

        _lotService.Verify(l => l.CreateLotAsync("ing-1", It.Is<IngredientLotDto>(d =>
            d.Quantity == 7m &&
            d.UnitCost == 11m)), Times.Once);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_CostOnlyChange_TouchesNoLotsAndNoMovements()
    {
        // TA-02 contract, now with the lot routing in place: a cost-only edit must
        // not read or mutate the ledger at all.
        var existing = Row(quantity: 10m, unitCost: 10m);
        SetupRow(existing);
        SetupLots(10m);

        var result = await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 10m, unitCost: 16.5m));

        Assert.Equal(16.5m, result.UnitCost);
        _lotService.Verify(l => l.GetLotsAsync(It.IsAny<string>()), Times.Never);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_DesyncedZeroLotDelta_ResyncsAggregatesWithoutTouchingLots()
    {
        // Row 10, ledger 2, and the operator requests exactly 2: the ledger needs no
        // mutation (lotDelta == 0), but the row must be resynced from the ledger
        // truth instead of silently keeping the stale row quantity.
        var existing = Row(quantity: 10m);
        SetupRow(existing);
        SetupLots(2m);
        _lotService.Setup(l => l.SyncIngredientAggregatesAsync("ing-1"))
            .Returns(Task.CompletedTask)
            .Callback(() => existing.Quantity = 2m); // what the real sync does to the row

        var result = await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 2m));

        _lotService.Verify(l => l.SyncIngredientAggregatesAsync("ing-1"), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(),
            It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i => i.Quantity == 2m)), Times.Once);
    }

    [Fact]
    public async Task UpdateAsync_ZeroTarget_DrainsLedgerThroughFifo()
    {
        var existing = Row(quantity: 5m);
        SetupRow(existing);
        SetupLots(5m);

        await CreateService().UpdateIngredientAsync("ing-1", Dto(quantity: 0m));

        _lotService.Verify(l => l.DeductFifoAsync("ing-1", 5m,
            MovementType.Adjustment, "Stock Edit", It.IsAny<string?>()), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
    }

    [Fact]
    public async Task CreateAsync_PositiveQuantity_CreatesInitialLotWithDtoMapping()
    {
        _ingredientRepository.Setup(r => r.AddAsync(It.IsAny<Ingredient>()))
            .ReturnsAsync((Ingredient i) => i);

        await CreateService().CreateIngredientAsync(Dto(quantity: 2m, unitCost: 5m, supplier: "ACME"));

        _ingredientRepository.Verify(r => r.AddAsync(It.Is<Ingredient>(i => i.Quantity == 2m)), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.Is<IngredientLotDto>(d =>
            d.Quantity == 2m &&
            d.UnitCost == 5m &&
            d.Supplier == "ACME")), Times.Once);
        _stockMovementService.Verify(s => s.CreateMovementAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task CreateAsync_ZeroQuantity_CreatesNoLot()
    {
        _ingredientRepository.Setup(r => r.AddAsync(It.IsAny<Ingredient>()))
            .ReturnsAsync((Ingredient i) => i);

        await CreateService().CreateIngredientAsync(Dto(quantity: 0m));

        _ingredientRepository.Verify(r => r.AddAsync(It.IsAny<Ingredient>()), Times.Once);
        _lotService.Verify(l => l.CreateLotAsync(It.IsAny<string>(), It.IsAny<IngredientLotDto>()), Times.Never);
    }
}
