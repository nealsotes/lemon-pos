using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for StockMovementService — previously zero-coverage. The service is
/// a thin read facade over IStockMovementRepository plus two write guards: a zero
/// quantity is rejected and an undefined movement type is rejected, both before any
/// insert. The by-ingredient date filter applies inclusive bounds in the service.
/// </summary>
public class StockMovementServiceTests
{
    private readonly Mock<IStockMovementRepository> _repository = new();
    private readonly StockMovementService _service;

    public StockMovementServiceTests()
    {
        _service = new StockMovementService(_repository.Object);
    }

    private static StockMovement Movement(string id, string ingredientId = "I1", decimal quantity = 10m)
    {
        return new StockMovement
        {
            Id = id,
            IngredientId = ingredientId,
            MovementType = MovementType.Sale,
            Quantity = quantity,
            UnitCost = 2m,
            CreatedAt = DateTime.UtcNow
        };
    }

    [Fact]
    public async Task GetAllMovementsAsync_DelegatesToRepository()
    {
        var movements = new List<StockMovement> { Movement("m-1"), Movement("m-2") };
        _repository.Setup(r => r.GetAllAsync()).ReturnsAsync(movements);

        var result = await _service.GetAllMovementsAsync();

        Assert.Same(movements, result);
    }

    [Fact]
    public async Task GetMovementByIdAsync_KnownId_ReturnsMovement()
    {
        var movement = Movement("m-1");
        _repository.Setup(r => r.GetByIdAsync("m-1")).ReturnsAsync(movement);

        var result = await _service.GetMovementByIdAsync("m-1");

        Assert.Same(movement, result);
    }

    [Fact]
    public async Task GetMovementByIdAsync_UnknownId_ReturnsNull()
    {
        _repository.Setup(r => r.GetByIdAsync("missing")).ReturnsAsync((StockMovement?)null);

        Assert.Null(await _service.GetMovementByIdAsync("missing"));
    }

    [Fact]
    public async Task GetMovementsByIngredientIdAsync_DelegatesToRepository()
    {
        var movements = new List<StockMovement> { Movement("m-1") };
        _repository.Setup(r => r.GetByIngredientIdAsync("I1")).ReturnsAsync(movements);

        var result = await _service.GetMovementsByIngredientIdAsync("I1");

        Assert.Same(movements, result);
    }

    [Fact]
    public async Task GetMovementsByIngredientIdAndDateRangeAsync_FiltersWithInclusiveBounds()
    {
        var before = Movement("m-before", quantity: 1m);
        before.CreatedAt = new DateTime(2026, 10, 30, 9, 0, 0);
        var atStart = Movement("m-start", quantity: 2m);
        atStart.CreatedAt = new DateTime(2026, 10, 30, 12, 0, 0);
        var middle = Movement("m-middle", quantity: 3m);
        middle.CreatedAt = new DateTime(2026, 10, 30, 12, 30, 0);
        var atEnd = Movement("m-end", quantity: 4m);
        atEnd.CreatedAt = new DateTime(2026, 10, 30, 13, 0, 0);
        var after = Movement("m-after", quantity: 5m);
        after.CreatedAt = new DateTime(2026, 10, 30, 14, 0, 0);

        _repository
            .Setup(r => r.GetByIngredientIdAsync("I1"))
            .ReturnsAsync(new[] { before, atStart, middle, atEnd, after });

        var result = await _service.GetMovementsByIngredientIdAndDateRangeAsync(
            "I1",
            new DateTime(2026, 10, 30, 12, 0, 0),
            new DateTime(2026, 10, 30, 13, 0, 0));

        // Boundary timestamps belong to the window; before/after do not.
        Assert.Equal(new[] { "m-start", "m-middle", "m-end" }, result.Select(m => m.Id));
    }

    [Fact]
    public async Task GetMovementsByDateRangeAsync_DelegatesArgsUntouched()
    {
        var movements = new List<StockMovement> { Movement("m-1") };
        _repository
            .Setup(r => r.GetByDateRangeAsync(new DateTime(2026, 10, 30), new DateTime(2026, 10, 31)))
            .ReturnsAsync(movements);

        var result = await _service.GetMovementsByDateRangeAsync(
            new DateTime(2026, 10, 30), new DateTime(2026, 10, 31));

        Assert.Same(movements, result);
    }

    [Fact]
    public async Task CreateMovementAsync_ZeroQuantity_ThrowsWithoutInsert()
    {
        var movement = Movement("m-1", quantity: 0m);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateMovementAsync(movement));

        Assert.Equal("Quantity cannot be zero", ex.Message);
        _repository.Verify(r => r.AddAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task CreateMovementAsync_UndefinedMovementType_ThrowsWithoutInsert()
    {
        var movement = Movement("m-1");
        movement.MovementType = (MovementType)999;

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateMovementAsync(movement));

        Assert.Equal("Invalid movement type", ex.Message);
        _repository.Verify(r => r.AddAsync(It.IsAny<StockMovement>()), Times.Never);
    }

    [Fact]
    public async Task CreateMovementAsync_ValidMovement_IsStoredAndReturned()
    {
        var movement = Movement("m-new", ingredientId: "I2", quantity: -3m);
        movement.MovementType = MovementType.Waste;
        _repository.Setup(r => r.AddAsync(movement)).ReturnsAsync(movement);

        var result = await _service.CreateMovementAsync(movement);

        // Negative quantities are legitimate (outflows) and stored as given.
        Assert.Same(movement, result);
        Assert.Equal(-3m, result.Quantity);
        _repository.Verify(r => r.AddAsync(movement), Times.Once);
    }

    [Fact]
    public async Task DeleteMovementAsync_DelegatesToRepository()
    {
        await _service.DeleteMovementAsync("m-1");

        _repository.Verify(r => r.DeleteAsync("m-1"), Times.Once);
    }
}