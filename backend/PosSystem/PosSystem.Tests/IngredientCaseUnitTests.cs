using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Repositories;
using PosSystem.Infrastructure.Services;
using System.Text;
using Xunit;

namespace PosSystem.Tests;

// Case is a fractional-capable label, never a packaging conversion.
public class IngredientCaseUnitTests : IDisposable
{
    private readonly PosSystemDbContext _context;
    private readonly IngredientService _service;

    public IngredientCaseUnitTests()
    {
        _context = new PosSystemDbContext(new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"partial-case-{Guid.NewGuid()}").Options);
        var ingredients = new IngredientRepository(_context);
        var movements = new StockMovementRepository(_context);
        var lots = new IngredientLotService(new IngredientLotRepository(_context), ingredients, movements, _context);
        _service = new IngredientService(ingredients, new StockMovementService(movements), lots);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static IngredientDto Dto(decimal quantity = 2.75m, string unit = "case", decimal threshold = 0.5m) => new()
    {
        Name = "Alfajor Box", Quantity = quantity, Unit = unit,
        LowStockThreshold = threshold, UnitCost = 50m, IsActive = true
    };

    private async Task SeedAsync(string unit = "case", decimal quantity = 2.75m)
    {
        // Seed legacy partial stock independently of create validation.
        _context.Ingredients.Add(new Ingredient
        {
            Id = "ing-1", Name = "Alfajor Box", Unit = unit, Quantity = quantity,
            LowStockThreshold = 0.5m, UnitCost = 50m, IsActive = true
        });
        _context.IngredientLots.Add(new IngredientLot
        {
            Id = "lot-1", IngredientId = "ing-1", InitialQuantity = quantity,
            RemainingQuantity = quantity, UnitCost = 50m, ReceivedAt = DateTime.UtcNow, IsActive = true
        });
        await _context.SaveChangesAsync();
    }

    private async Task AssertBalanceAsync(string id, decimal quantity)
    {
        _context.ChangeTracker.Clear();
        Assert.Equal(quantity, (await _context.Ingredients.SingleAsync(i => i.Id == id)).Quantity);
        Assert.Equal(quantity, await _context.IngredientLots.Where(l => l.IngredientId == id && l.IsActive)
            .SumAsync(l => l.RemainingQuantity));
    }

    [Theory]
    [InlineData("case")]
    [InlineData("Case")]
    [InlineData("CASE")]
    public async Task CreateIngredientAsync_PartialCaseAndThreshold_SeedsExactLot(string unit)
    {
        var created = await _service.CreateIngredientAsync(Dto(unit: unit));

        Assert.Equal(unit, created.Unit);
        Assert.Equal(0.5m, created.LowStockThreshold);
        await AssertBalanceAsync(created.Id, 2.75m);
        var receipt = Assert.Single(await _context.StockMovements.ToListAsync());
        Assert.Equal(MovementType.Purchase, receipt.MovementType);
        Assert.Equal(2.75m, receipt.Quantity);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SaveIngredientAsync_WholeCaseWithFractionalThreshold_AcceptsThreshold(bool update)
    {
        if (update) await SeedAsync(quantity: 3m);
        var saved = update
            ? await _service.UpdateIngredientAsync("ing-1", Dto(3m))
            : await _service.CreateIngredientAsync(Dto(3m));

        Assert.Equal(0.5m, saved.LowStockThreshold);
        await AssertBalanceAsync(saved.Id, 3m);
    }

    [Theory]
    [InlineData("case")]
    [InlineData("Case")]
    [InlineData("CASE")]
    public async Task UpdateIngredientAsync_MetadataOnly_RetainsPartialCaseWithoutLedgerMovement(string unit)
    {
        await SeedAsync(unit);
        var dto = Dto(unit: unit);
        dto.Name = "Renamed box";
        dto.Supplier = "New supplier";
        dto.UnitCost = 75m;

        var updated = await _service.UpdateIngredientAsync("ing-1", dto);

        Assert.Equal("Renamed box", updated.Name);
        Assert.Equal("New supplier", updated.Supplier);
        Assert.Equal(75m, updated.UnitCost);
        Assert.Equal(0.5m, updated.LowStockThreshold);
        await AssertBalanceAsync("ing-1", 2.75m);
        Assert.Empty(await _context.StockMovements.ToListAsync());
        Assert.Single(await _context.IngredientLots.ToListAsync());
    }

    [Theory]
    [InlineData("case", 1.25)]
    [InlineData("Case", 3.25)]
    [InlineData("CASE", 1.25)]
    public async Task UpdateIngredientAsync_ChangedPartialCaseTarget_LandsExactRowAndLedger(string unit, double target)
    {
        await SeedAsync(unit);
        var quantity = (decimal)target;

        var updated = await _service.UpdateIngredientAsync("ing-1", Dto(quantity, unit, 0.75m));

        Assert.Equal(0.75m, updated.LowStockThreshold);
        await AssertBalanceAsync("ing-1", quantity);
        var movement = Assert.Single(await _context.StockMovements.ToListAsync());
        Assert.Equal(quantity - 2.75m, movement.Quantity);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ImportAsync_PartialCaseCreateOrUpdate_AcceptsExactQuantityAndThreshold(bool update)
    {
        if (update) await SeedAsync();
        var importer = new ImportService(Mock.Of<IProductService>(), _service,
            Mock.Of<IExpenseService>(), Mock.Of<IExpenseCategoryRepository>());
        using var csv = new MemoryStream(Encoding.UTF8.GetBytes(
            "Name,Quantity,Unit,Low Stock Threshold\nAlfajor Box,1.25,CASE,0.75\n"));

        var report = await importer.ImportAsync(ImportKind.Ingredients, "cases.csv", csv, "tester");

        Assert.Empty(report.Errors);
        Assert.Equal(update ? 0 : 1, report.Created);
        Assert.Equal(update ? 1 : 0, report.Updated);
        var saved = await _context.Ingredients.SingleAsync();
        Assert.Equal("CASE", saved.Unit);
        Assert.Equal(0.75m, saved.LowStockThreshold);
        await AssertBalanceAsync(saved.Id, 1.25m);
    }

    [Theory]
    [InlineData("pcs")]
    [InlineData("piece")]
    [InlineData("pieces")]
    [InlineData("PCS")]
    public async Task CreateIngredientAsync_LegacyPieces_StillAcceptsFractionalQuantityAndThreshold(string unit)
    {
        var created = await _service.CreateIngredientAsync(Dto(unit: unit));

        Assert.Equal(0.5m, created.LowStockThreshold);
        await AssertBalanceAsync(created.Id, 2.75m);
    }

    [Theory]
    [InlineData("pcs", true)]
    [InlineData("pcs", false)]
    [InlineData("piece", true)]
    [InlineData("piece", false)]
    [InlineData("pieces", true)]
    [InlineData("pieces", false)]
    [InlineData("PCS", true)]
    [InlineData("PCS", false)]
    public async Task UpdateIngredientAsync_LegacyPieces_StillRejectsFractionalQuantityOrThreshold(string unit, bool partialQuantity)
    {
        await SeedAsync(unit, 3m);
        var dto = Dto(partialQuantity ? 2.75m : 3m, unit, partialQuantity ? 1m : 0.5m);

        var error = await Assert.ThrowsAsync<ArgumentException>(() => _service.UpdateIngredientAsync("ing-1", dto));

        Assert.Equal(partialQuantity ? "Quantity must be a whole number for pieces"
            : "Low stock threshold must be a whole number for pieces", error.Message);
        await AssertBalanceAsync("ing-1", 3m);
        Assert.Empty(await _context.StockMovements.ToListAsync());
    }

    [Theory]
    [InlineData("kg")]
    [InlineData("L")]
    public async Task SaveIngredientAsync_KgAndLitres_StillAcceptsFractionalCreateAndUpdate(string unit)
    {
        var created = await _service.CreateIngredientAsync(Dto(unit: unit));
        await AssertBalanceAsync(created.Id, 2.75m);

        var updated = await _service.UpdateIngredientAsync(created.Id, Dto(1.25m, unit, 0.75m));

        Assert.Equal(0.75m, updated.LowStockThreshold);
        await AssertBalanceAsync(created.Id, 1.25m);
    }
}
