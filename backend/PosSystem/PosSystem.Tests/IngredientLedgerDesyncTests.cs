using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Repositories;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Read-only ledger desync diagnostic: report items whose row quantity disagrees
/// with the sum of their active FIFO lots. The fix itself is forward-looking
/// (quantity edits route through the ledger); NO boot-time auto-mutation of legacy
/// data - operators reconcile flagged items manually via Adjust Stock or a stock
/// import. The diagnostic exists so the drift can be found without SQL access.
/// </summary>
public class IngredientLedgerDesyncTests : IDisposable
{
    private readonly PosSystemDbContext _context;
    private readonly IngredientRepository _ingredientRepo;
    private readonly IngredientLotRepository _lotRepo;
    private readonly IngredientService _ingredientService;

    public IngredientLedgerDesyncTests()
    {
        _context = new PosSystemDbContext(new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"ledger-desync-{Guid.NewGuid()}")
            .Options);
        _ingredientRepo = new IngredientRepository(_context);
        _lotRepo = new IngredientLotRepository(_context);
        _ingredientService = new IngredientService(
            _ingredientRepo, new Mock<IStockMovementService>().Object,
            new IngredientLotService(_lotRepo, _ingredientRepo, new StockMovementRepository(_context), _context));
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<Ingredient> SeedAsync(string id, string name, decimal quantity, bool isActive = true)
    {
        var ingredient = new Ingredient
        {
            Id = id, Name = name, Quantity = quantity, Unit = "L", LowStockThreshold = 1m, IsActive = isActive
        };
        _context.Ingredients.Add(ingredient);
        await _context.SaveChangesAsync();
        return ingredient;
    }

    private async Task SeedLotAsync(string ingredientId, decimal remaining)
    {
        await _lotRepo.AddAsync(new IngredientLot
        {
            IngredientId = ingredientId, UnitCost = 10m, InitialQuantity = remaining,
            RemainingQuantity = remaining, ReceivedAt = DateTime.UtcNow, IsActive = true
        });
    }

    [Fact]
    public async Task GetLedgerDesyncsAsync_ReportsRowLedgerMismatchOnly()
    {
        await SeedAsync("desynced", "Desynced Item", 5m);      // row 5, lots 0
        await SeedAsync("aligned", "Aligned Item", 4m);        // row 4, lots 4
        await SeedLotAsync("aligned", 4m);
        await SeedAsync("inactive", "Inactive Item", 9m, isActive: false);      // row 9, lots 0, inactive

        var desyncs = (await _ingredientRepo.GetLedgerDesyncsAsync()).ToList();

        var entry = Assert.Single(desyncs);
        Assert.Equal("desynced", entry.IngredientId);
        Assert.Equal("Desynced Item", entry.Name);
        Assert.Equal(5m, entry.RowQuantity);
        Assert.Equal(0m, entry.LotQuantity);
    }

    [Fact]
    public async Task ServicePassthrough_ReturnsTheRepositoryReport()
    {
        await SeedAsync("desynced", "Desynced Item", 5m);

        var desyncs = (await _ingredientService.GetLedgerDesyncsAsync()).ToList();

        var entry = Assert.Single(desyncs);
        Assert.Equal("Desynced Item", entry.Name);
    }
}
