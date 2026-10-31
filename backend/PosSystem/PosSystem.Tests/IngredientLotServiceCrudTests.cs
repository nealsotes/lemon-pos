using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for the lot bookkeeping of IngredientLotService (previously
/// zero-coverage): the create/update facade, the ingredient-scoped lot lookup, and the
/// FIFO costing snapshot. Concurrency semantics of DeductFifoAsync against real MySQL
/// are covered by the dedicated MySQL harness (see IngredientLotServiceFifoTests for
/// the non-relational sweep contract).
/// </summary>
public class IngredientLotServiceCrudTests
{
    private readonly Mock<IIngredientLotRepository> _lotRepository = new();
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IStockMovementRepository> _movementRepository = new();
    private readonly PosSystemDbContext _context = new(
        new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"lot-crud-{Guid.NewGuid()}")
            .Options);

    private IngredientLotService BuildService() =>
        new(_lotRepository.Object, _ingredientRepository.Object, _movementRepository.Object, _context);

    private static Ingredient Ingredient(string id = "I1", decimal quantity = 0m, decimal unitCost = 0m) =>
        new() { Id = id, Name = "Milk", Unit = "L", Quantity = quantity, UnitCost = unitCost, LowStockThreshold = 5m };

    private static IngredientLotDto LotDto(decimal quantity = 12m, decimal unitCost = 2.5m, string? supplier = "FarmCo") =>
        new()
        {
            Supplier = supplier,
            UnitCost = unitCost,
            Quantity = quantity,
            ExpirationDate = new DateTime(2027, 1, 1),
            LotNumber = "BATCH-77",
            Notes = "morning delivery"
        };

    private void StubLotRepositoryAdd()
    {
        _lotRepository
            .Setup(r => r.AddAsync(It.IsAny<IngredientLot>()))
            .Callback<IngredientLot>(l => l.Id = "LOT-NEW-1")
            .ReturnsAsync((IngredientLot l) => l);
        _movementRepository
            .Setup(r => r.AddAsync(It.IsAny<StockMovement>()))
            .ReturnsAsync((StockMovement m) => m);
    }

    [Fact]
    public async Task GetLotsAsync_OnlyHandsBackActiveLots()
    {
        var lots = new List<IngredientLot> { new() { Id = "LOT-1", IngredientId = "I1" } };
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1")).ReturnsAsync(lots);

        Assert.Same(lots, await BuildService().GetLotsAsync("I1"));
        _lotRepository.Verify(r => r.GetActiveByIngredientIdAsync("I1"), Times.Once);
    }

    [Fact]
    public async Task GetLotByIdAsync_LotOfAnotherIngredient_IsInvisible()
    {
        // A lot belongs to exactly one ingredient: cross-ingredient access must look
        // like a missing lot (no leakage through the raw id).
        _lotRepository.Setup(r => r.GetByIdAsync("LOT-1")).ReturnsAsync(new IngredientLot
        {
            Id = "LOT-1",
            IngredientId = "I2",
            RemainingQuantity = 5m
        });

        Assert.Null(await BuildService().GetLotByIdAsync("I1", "LOT-1"));
    }

    [Fact]
    public async Task GetLotByIdAsync_UnknownId_ReturnsNull()
    {
        _lotRepository.Setup(r => r.GetByIdAsync("missing")).ReturnsAsync((IngredientLot?)null);

        Assert.Null(await BuildService().GetLotByIdAsync("I1", "missing"));
    }

    [Fact]
    public async Task GetLotByIdAsync_OwningIngredient_ReturnsLot()
    {
        var lot = new IngredientLot { Id = "LOT-1", IngredientId = "I1" };
        _lotRepository.Setup(r => r.GetByIdAsync("LOT-1")).ReturnsAsync(lot);

        var result = await BuildService().GetLotByIdAsync("I1", "LOT-1");

        Assert.Same(lot, result);
    }

    [Fact]
    public async Task CreateLotAsync_UnknownIngredient_ThrowsWithoutAddingAnything()
    {
        _ingredientRepository.Setup(r => r.GetByIdAsync("I9")).ReturnsAsync((Ingredient?)null);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateLotAsync("I9", LotDto()));

        Assert.Contains("Ingredient with ID I9 not found", ex.Message);
        _lotRepository.Verify(r => r.AddAsync(It.IsAny<IngredientLot>()), Times.Never);
        _movementRepository.Verify(r => r.AddAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task CreateLotAsync_NonPositiveQuantity_Throws(decimal quantity)
    {
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(Ingredient());

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateLotAsync("I1", LotDto(quantity: quantity)));

        Assert.Contains("Lot quantity must be greater than zero", ex.Message);
        _lotRepository.Verify(r => r.AddAsync(It.IsAny<IngredientLot>()), Times.Never);
    }

    [Fact]
    public async Task CreateLotAsync_ValidLot_StoresLotRecordsPurchaseMovementAndSyncsAggregate()
    {
        var ingredient = Ingredient(quantity: 0m, unitCost: 0m);
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(ingredient);

        // The aggregate sync runs after the add: the lot list must reflect the new lot.
        IngredientLot? addedLot = null;
        _lotRepository
            .Setup(r => r.GetActiveByIngredientIdAsync("I1"))
            .ReturnsAsync(() => addedLot == null
                ? new List<IngredientLot>()
                : new List<IngredientLot> { addedLot });
        StubLotRepositoryAdd();
        _lotRepository
            .Setup(r => r.AddAsync(It.IsAny<IngredientLot>()))
            .Callback<IngredientLot>(l => { l.Id = "LOT-NEW-1"; addedLot = l; })
            .ReturnsAsync((IngredientLot l) => l);

        var created = await BuildService().CreateLotAsync("I1", LotDto());

        // The lot stores the receipt facts verbatim, active with the full balance.
        Assert.Equal("I1", created.IngredientId);
        Assert.Equal("FarmCo", created.Supplier);
        Assert.Equal(2.5m, created.UnitCost);
        Assert.Equal(12m, created.InitialQuantity);
        Assert.Equal(12m, created.RemainingQuantity);
        Assert.Equal(new DateTime(2027, 1, 1), created.ExpirationDate);
        Assert.Equal("BATCH-77", created.LotNumber);
        Assert.Equal("morning delivery", created.Notes);
        Assert.True(created.IsActive);
        Assert.InRange((created.ReceivedAt - DateTime.UtcNow).TotalSeconds, -30, 30);

        // A Purchase movement mirrors the receipt, linked to the created lot.
        _movementRepository.Verify(r => r.AddAsync(It.Is<StockMovement>(m =>
            m.Id.Length > 0 &&
            m.IngredientId == "I1" &&
            m.MovementType == MovementType.Purchase &&
            m.Quantity == 12m &&
            m.UnitCost == 2.5m &&
            m.LotId == "LOT-NEW-1" &&
            m.Reason == "Purchase" &&
            m.Notes == "Lot received: 12 units from FarmCo at 2.50/unit")), Times.Once);

        // The ingredient aggregate now reflects the new lot's balance, supplier and cost.
        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i =>
            i.Quantity == 12m &&
            i.UnitCost == 2.5m &&
            i.Supplier == "FarmCo" &&
            i.LastPurchaseCost == 2.5m)), Times.Once);
    }

    [Fact]
    public async Task CreateLotAsync_UnknownSupplier_StillQuotesMovementNotes()
    {
        var ingredient = Ingredient();
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(ingredient);
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1")).ReturnsAsync(new List<IngredientLot>());
        StubLotRepositoryAdd();

        await BuildService().CreateLotAsync("I1", LotDto(supplier: null));

        _movementRepository.Verify(r => r.AddAsync(It.Is<StockMovement>(m =>
            m.Notes == "Lot received: 12 units from unknown at 2.50/unit")), Times.Once);
    }

    [Fact]
    public async Task UpdateLotAsync_LotOfAnotherIngredient_ThrowsAndChangesNothing()
    {
        _lotRepository.Setup(r => r.GetByIdAsync("LOT-1")).ReturnsAsync(new IngredientLot
        {
            Id = "LOT-1",
            IngredientId = "I2"
        });

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().UpdateLotAsync("I1", "LOT-1",
                new IngredientLotUpdateDto { Supplier = "NewFarm" }));

        Assert.Contains("Lot with ID LOT-1 not found for ingredient I1", ex.Message);
        _lotRepository.Verify(r => r.UpdateAsync(It.IsAny<IngredientLot>()), Times.Never);
        _ingredientRepository.Verify(r => r.UpdateAsync(It.IsAny<Ingredient>()), Times.Never);
    }

    [Fact]
    public async Task UpdateLotAsync_UnknownLot_Throws()
    {
        _lotRepository.Setup(r => r.GetByIdAsync("missing")).ReturnsAsync((IngredientLot?)null);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().UpdateLotAsync("I1", "missing", new IngredientLotUpdateDto()));

        Assert.Contains("Lot with ID missing not found", ex.Message);
        _lotRepository.Verify(r => r.UpdateAsync(It.IsAny<IngredientLot>()), Times.Never);
    }

    [Fact]
    public async Task UpdateLotAsync_BlankFields_PreserveExistingValues()
    {
        var lot = new IngredientLot
        {
            Id = "LOT-1",
            IngredientId = "I1",
            Supplier = "FarmCo",
            ExpirationDate = new DateTime(2027, 1, 1),
            LotNumber = "BATCH-77",
            Notes = "kept"
        };
        _lotRepository.Setup(r => r.GetByIdAsync("LOT-1")).ReturnsAsync(lot);
        _lotRepository.Setup(r => r.UpdateAsync(It.IsAny<IngredientLot>()))
            .ReturnsAsync((IngredientLot l) => l);
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1"))
            .ReturnsAsync(new[] { lot });
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(Ingredient(quantity: 5m));

        var updated = await BuildService().UpdateLotAsync("I1", "LOT-1", new IngredientLotUpdateDto());

        // All blank edit fields mean "keep the current lot paperwork".
        Assert.Equal("FarmCo", updated.Supplier);
        Assert.Equal(new DateTime(2027, 1, 1), updated.ExpirationDate);
        Assert.Equal("BATCH-77", updated.LotNumber);
        Assert.Equal("kept", updated.Notes);
        _lotRepository.Verify(r => r.UpdateAsync(lot), Times.Once);
    }

    [Fact]
    public async Task UpdateLotAsync_ExplicitFields_OverwriteAndSync()
    {
        var lot = new IngredientLot
        {
            Id = "LOT-1",
            IngredientId = "I1",
            Supplier = "FarmCo",
            RemainingQuantity = 5m,
            UnitCost = 2m,
            ReceivedAt = new DateTime(2026, 10, 30, 12, 0, 0)
        };
        _lotRepository.Setup(r => r.GetByIdAsync("LOT-1")).ReturnsAsync(lot);
        _lotRepository.Setup(r => r.UpdateAsync(It.IsAny<IngredientLot>()))
            .ReturnsAsync((IngredientLot l) => l);
        _lotRepository.Setup(r => r.GetActiveByIngredientIdAsync("I1")).ReturnsAsync(new[] { lot });
        _ingredientRepository.Setup(r => r.GetByIdAsync("I1")).ReturnsAsync(Ingredient());

        var updated = await BuildService().UpdateLotAsync("I1", "LOT-1", new IngredientLotUpdateDto
        {
            Supplier = "NewFarm",
            ExpirationDate = new DateTime(2027, 6, 1),
            LotNumber = "BATCH-99",
            Notes = "relabeled"
        });

        Assert.Equal("NewFarm", updated.Supplier);
        Assert.Equal(new DateTime(2027, 6, 1), updated.ExpirationDate);
        Assert.Equal("BATCH-99", updated.LotNumber);
        Assert.Equal("relabeled", updated.Notes);

        // The aggregate sync ran with the relabeled lot (supplier is the newest lot's).
        _ingredientRepository.Verify(r => r.UpdateAsync(It.Is<Ingredient>(i =>
            i.Quantity == 5m &&
            i.Supplier == "NewFarm" &&
            i.LastPurchaseCost == 2m &&
            i.LastPurchaseDate == new DateTime(2026, 10, 30, 12, 0, 0))), Times.Once);
    }

    [Fact]
    public async Task GetFifoCostsAsync_OldestActiveLotWinsPerIngredient()
    {
        _ingredientRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            Ingredient("I1")
        });
        _lotRepository.Setup(r => r.GetOldestActiveLotAsync("I1")).ReturnsAsync(
            new IngredientLot { Id = "LOT-OLD", UnitCost = 2m, ReceivedAt = DateTime.UtcNow.AddDays(-9) });
        _lotRepository.Setup(r => r.GetMostRecentLotAsync("I1")).ReturnsAsync(
            new IngredientLot { Id = "LOT-NEW", UnitCost = 9m, ReceivedAt = DateTime.UtcNow });

        var costs = await BuildService().GetFifoCostsAsync();

        Assert.Single(costs);
        Assert.Equal(2m, costs["I1"]);
    }

    [Fact]
    public async Task GetFifoCostsAsync_DepletedIngredient_FallsBackToMostRecentLot()
    {
        _ingredientRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            Ingredient("I2")
        });
        _lotRepository.Setup(r => r.GetOldestActiveLotAsync("I2")).ReturnsAsync((IngredientLot?)null);
        _lotRepository.Setup(r => r.GetMostRecentLotAsync("I2")).ReturnsAsync(
            new IngredientLot { Id = "LOT-NEW", UnitCost = 4m, ReceivedAt = DateTime.UtcNow });

        var costs = await BuildService().GetFifoCostsAsync();

        Assert.Equal(4m, costs["I2"]);
    }

    [Fact]
    public async Task GetFifoCostsAsync_IngredientWithoutLots_IsOmitted()
    {
        _ingredientRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(new[]
        {
            Ingredient("I3")
        });
        _lotRepository.Setup(r => r.GetOldestActiveLotAsync("I3")).ReturnsAsync((IngredientLot?)null);
        _lotRepository.Setup(r => r.GetMostRecentLotAsync("I3")).ReturnsAsync((IngredientLot?)null);

        var costs = await BuildService().GetFifoCostsAsync();

        // Omitted entirely: the frontend falls back to the ingredient's own unitCost.
        Assert.Empty(costs);
        Assert.False(costs.ContainsKey("I3"));
    }
}