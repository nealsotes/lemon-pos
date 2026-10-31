using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for the FIFO lot sweep logic (roadmap item 1, corruption-source fix):
/// oldest lot first, insufficient requests are rejected before any writes, drained lots
/// deactivate, and every decrement is mirrored by a Sale/Adjustment stock movement.
/// The relational locking/guarded-SQL behavior runs against real MySQL and is verified
/// in the verification harness, not here.
/// </summary>
public class IngredientLotServiceFifoTests
{
    private readonly Mock<IIngredientLotRepository> _lotRepository = new();
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IStockMovementRepository> _movementRepository = new();
    private readonly PosSystemDbContext _inMemoryContext =
        new(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"fifo-tests-{Guid.NewGuid()}")
            .Options);

    public IngredientLotServiceFifoTests()
    {
        // The sweep consults the context only for relativity/transaction checks; the
        // in-memory provider reads as non-relational, exercising the tracked-update path.
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(new Ingredient
        {
            Id = "I1",
            Name = "Milk",
            Unit = "L",
            Quantity = 150m,
            LowStockThreshold = 5m
        });
    }

    private IngredientLotService BuildService()
    {
        return new IngredientLotService(
            _lotRepository.Object,
            _ingredientRepository.Object,
            _movementRepository.Object,
            _inMemoryContext);
    }

    private static IngredientLot Lot(string id, decimal remaining, decimal unitCost = 2m, bool active = true, string? lotNumber = null)
    {
        return new IngredientLot
        {
            Id = id,
            IngredientId = "I1",
            InitialQuantity = remaining,
            RemainingQuantity = remaining,
            UnitCost = unitCost,
            ReceivedAt = DateTime.UtcNow.AddDays(-5).AddHours(id.Length),
            IsActive = active,
            LotNumber = lotNumber
        };
    }

    [Fact]
    public async Task DeductFifoAsync_ConsumesOldestLotFirstAndRecordsMovements()
    {
        var oldest = Lot("L-AAAA", remaining: 40m, unitCost: 2m, lotNumber: "BATCH-1");
        var lotId = "L-AAAB";
        var newer = Lot(lotId, remaining: 60m, unitCost: 3m, lotNumber: "BATCH-2");

        _lotRepository.Setup(r => r.GetFifoLotsAsync("I1")).ReturnsAsync(new[] { oldest, newer });
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1")).ReturnsAsync(new[] { oldest, newer });
        _lotRepository.Setup(r => r.UpdateAsync(It.IsAny<IngredientLot>())).ReturnsAsync((IngredientLot l) => l);
        _movementRepository.Setup(r => r.AddAsync(It.IsAny<StockMovement>())).ReturnsAsync((StockMovement m) => m);

        var movements = await BuildService().DeductFifoAsync("I1", 70m, MovementType.Sale, "POS Sale");

        // Oldest lot fully drained and deactivated; the rest comes from the newer lot.
        Assert.Equal(0m, oldest.RemainingQuantity);
        Assert.False(oldest.IsActive);
        Assert.Equal(30m, newer.RemainingQuantity);
        Assert.True(newer.IsActive);

        _lotRepository.Verify(r => r.UpdateAsync(oldest), Times.Once);
        _lotRepository.Verify(r => r.UpdateAsync(newer), Times.Once);

        Assert.Equal(2, movements.Count);
        Assert.Equal(-40m, movements[0].Quantity);
        Assert.Equal(2m, movements[0].UnitCost);
        Assert.Equal("L-AAAA", movements[0].LotId);
        Assert.Equal(-30m, movements[1].Quantity);
        Assert.Equal(3m, movements[1].UnitCost);
        Assert.Equal("L-AAAB", movements[1].LotId);
    }

    [Fact]
    public async Task DeductFifoAsync_InsufficientTotal_RejectsBeforeAnyWrite()
    {
        _lotRepository.Setup(r => r.GetFifoLotsAsync("I1")).ReturnsAsync(new[] { Lot("L-AAAA", 10m) });

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().DeductFifoAsync("I1", 25m, MovementType.Sale));

        Assert.Contains("Insufficient stock for Milk", ex.Message);
        Assert.Contains("Required: 25", ex.Message);
        Assert.Contains("Available: 10", ex.Message);

        _lotRepository.Verify(r => r.UpdateAsync(It.IsAny<IngredientLot>()), Times.Never);
        _movementRepository.Verify(r => r.AddAsync(It.IsAny<StockMovement>()), Times.Never);
        _ingredientRepository.Verify(r => r.UpdateAsync(It.IsAny<Ingredient>()), Times.Never);
    }

    [Fact]
    public async Task DeductFifoAsync_SyncsIngredientAggregateFromRemainingLots()
    {
        var lot = Lot("L-AAAA", remaining: 75m, unitCost: 5m);
        _lotRepository.Setup(r => r.GetFifoLotsAsync("I1")).ReturnsAsync(new[] { lot });
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1")).ReturnsAsync(new[] { lot });
        _lotRepository.Setup(r => r.UpdateAsync(It.IsAny<IngredientLot>())).ReturnsAsync((IngredientLot l) => l);
        _movementRepository.Setup(r => r.AddAsync(It.IsAny<StockMovement>())).ReturnsAsync((StockMovement m) => m);

        await BuildService().DeductFifoAsync("I1", 25m, MovementType.Adjustment, "Waste", " spoilt ");

        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i =>
            i.Quantity == 50m && i.Supplier == lot.Supplier)), Times.Once);
        _movementRepository.Verify(r => r.AddAsync(It.Is<StockMovement>(m =>
            m.Quantity == -25m && m.MovementType == MovementType.Adjustment && m.Reason == "Waste")));
    }

    [Fact]
    public async Task DeductFifoAsync_ZeroOrNegativeQuantity_ThrowsWithoutReadingLots()
    {
        var service = BuildService();

        await Assert.ThrowsAsync<ArgumentException>(
            () => service.DeductFifoAsync("I1", 0m, MovementType.Sale));
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.DeductFifoAsync("I1", -5m, MovementType.Sale));

        _lotRepository.Verify(r => r.GetFifoLotsAsync(It.IsAny<string>()), Times.Never);
        _movementRepository.Verify(r => r.AddAsync(It.IsAny<StockMovement>()), Times.Never);
    }
}