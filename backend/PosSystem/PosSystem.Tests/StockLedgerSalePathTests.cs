using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Moq;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Repositories;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// End-to-end stock-ledger desync fix, over real repositories and the real
/// IngredientLotService on an InMemory database:
///  - a stock item whose quantity was set by an EDIT or a CREATE (import shape)
///    becomes sellable through recipes, because the mutation went through the FIFO
///    ledger instead of hand-writing the row;
///  - every successful quantity edit lands row == lots == the requested quantity
///    (absolute-target semantics self-heals pre-fix desynced rows);
///  - a sale whose ledger cannot cover the requirement fails with ONE honest,
///    cashier-readable line built from the LOT-side availability (never the stale
///    row figure, never the raw lot-service wording).
/// Mirrors TransactionServiceSalePathTests' harness (stubbed unit-of-work, real
/// deduction sweeps on the non-relational path).
/// </summary>
public class StockLedgerSalePathTests : IDisposable
{
    private readonly PosSystemDbContext _context;

    private readonly Mock<ITransactionRepository> _transactionRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IInventoryService> _inventoryService = new();
    private readonly Mock<IProductIngredientRepository> _productIngredientRepository = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly Mock<IDbContextTransaction> _dbTransactionStub = new();

    private readonly IngredientRepository _ingredientRepo;
    private readonly IngredientLotRepository _lotRepo;
    private readonly StockMovementRepository _movementRepo;
    private readonly IngredientLotService _lotService;
    private readonly IngredientService _ingredientService;

    public StockLedgerSalePathTests()
    {
        _context = new PosSystemDbContext(new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"stock-ledger-{Guid.NewGuid()}")
            .Options);

        _ingredientRepo = new IngredientRepository(_context);
        _lotRepo = new IngredientLotRepository(_context);
        _movementRepo = new StockMovementRepository(_context);
        _lotService = new IngredientLotService(_lotRepo, _ingredientRepo, _movementRepo, _context);
        _ingredientService = new IngredientService(_ingredientRepo, new StockMovementService(_movementRepo), _lotService);

        _dbTransactionStub.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
        _dbTransactionStub.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(_dbTransactionStub.Object);
        _transactionRepository.Setup(r => r.AddAsync(It.IsAny<Transaction>())).ReturnsAsync((Transaction t) => t);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static Product Product(string id = "P1", string name = "Red Horse Can 330ml x 24", decimal price = 105m, int stock = 10) =>
        new() { Id = id, Name = name, Price = price, Category = "Beer", Stock = stock };

    private static async Task<Ingredient> SeedIngredientAsync(PosSystemDbContext context, string name, decimal quantity)
    {
        var ingredient = new Ingredient
        {
            Id = "ing-1",
            Name = name,
            Quantity = quantity,
            Unit = "L",
            LowStockThreshold = 1m,
            UnitCost = 10m,
            IsActive = true
        };
        context.Ingredients.Add(ingredient);
        await context.SaveChangesAsync();
        return ingredient;
    }

    private static IngredientDto Edit(decimal quantity, decimal? unitCost = 10m) => new()
    {
        Name = "Red Horse Can 330ml x 24",
        Quantity = quantity,
        Unit = "L",
        Supplier = "ACME",
        LowStockThreshold = 1m,
        UnitCost = unitCost
    };

    private static Transaction Sale(int quantity = 1, decimal price = 105m)
    {
        var transaction = new Transaction
        {
            PaymentMethod = "cash",
            ServiceFee = 0m,
            Total = 0m,
            Items = new List<TransactionItem>()
        };
        transaction.Items.Add(new TransactionItem
        {
            ProductId = "P1",
            Name = "Red Horse Can 330ml x 24",
            Price = price,
            Quantity = quantity,
            Temperature = Temperature.None
        });
        return transaction;
    }

    private void StubProductSale(string ingredientId = "ing-1", decimal quantityPerUnit = 1m)
    {
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product());
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", It.IsAny<int>())).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync("P1", It.IsAny<int>())).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P1")).ReturnsAsync(new List<ProductIngredient>
        {
            new() { ProductId = "P1", IngredientId = ingredientId, QuantityPerUnit = quantityPerUnit }
        });
    }

    private TransactionService BuildSaleService() => new(
        _transactionRepository.Object,
        _productRepository.Object,
        _inventoryService.Object,
        _lotService,
        _ingredientRepo,
        _productIngredientRepository.Object,
        _unitOfWork.Object,
        _context);

    [Fact]
    public async Task EditShapedQuantity_BecomesSellableThroughRecipe()
    {
        // The old flow: quantity set directly on the row, no lots - any recipe sale
        // failed with the contradictory row-vs-lot message. Import/edit shape 0 -> 3:
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 0m);
        Assert.Equal(0m, seeded.Quantity);

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 3m));

        var afterEdit = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        Assert.Equal(3m, afterEdit.Quantity);

        StubProductSale();
        await BuildSaleService().CreateTransactionAsync(Sale());

        // FIFO movement -1 came from the lot created by the edit; the row followed.
        var movements = await _context.StockMovements
            .Where(m => m.IngredientId == "ing-1")
            .ToListAsync();
        var saleMovement = movements.Single(m => m.MovementType == MovementType.Sale);
        Assert.Equal(-1m, saleMovement.Quantity);
        var editLot = await _context.IngredientLots.SingleAsync(l => l.IngredientId == "ing-1");
        Assert.Equal(editLot.Id, saleMovement.LotId);

        var afterSale = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        Assert.Equal(2m, afterSale.Quantity);
    }

    [Fact]
    public async Task CreateWithQuantity_IsSellableThroughRecipe_WithInitialLot()
    {
        var created = await _ingredientService.CreateIngredientAsync(Edit(quantity: 2m));
        var ingredientId = created.Id;

        var afterCreate = (await _ingredientRepo.GetByIdAsync(ingredientId))!;
        Assert.Equal(2m, afterCreate.Quantity);
        var lot = Assert.Single(await _context.IngredientLots.Where(l => l.IngredientId == ingredientId).ToListAsync());
        Assert.Equal(2m, lot.RemainingQuantity);
        // The initial lot's Purchase receipt is on the ledger - audit trail intact.
        var purchase = Assert.Single(await _context.StockMovements.Where(m => m.IngredientId == ingredientId).ToListAsync());
        Assert.Equal(MovementType.Purchase, purchase.MovementType);
        Assert.Equal(2m, purchase.Quantity);

        StubProductSale(ingredientId);
        await BuildSaleService().CreateTransactionAsync(Sale());

        var afterSale = (await _ingredientRepo.GetByIdAsync(ingredientId))!;
        Assert.Equal(1m, afterSale.Quantity);
    }

    [Fact]
    public async Task Edit_Reduce_LandsRowAndLotsAtRequestedQuantity()
    {
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 10m);
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-10", IngredientId = seeded.Id, UnitCost = 10m,
            InitialQuantity = 10m, RemainingQuantity = 10m, ReceivedAt = DateTime.UtcNow, IsActive = true
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 3m));

        var after = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        var lotTotal = (await _lotRepo.GetActiveByIngredientIdAsync("ing-1")).Sum(l => l.RemainingQuantity);
        Assert.Equal(3m, after.Quantity);
        Assert.Equal(3m, lotTotal);
    }

    [Fact]
    public async Task Edit_OnDesyncedLegacyRow_LandsRequestedQuantityAndRealignedLedger()
    {
        // Pre-fix legacy shape (Neal's live incident class): the row says 2 while the
        // ledger holds 10. Any post-fix quantity edit must land ON the requested value.
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 2m);
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-10", IngredientId = seeded.Id, UnitCost = 10m,
            InitialQuantity = 10m, RemainingQuantity = 10m, ReceivedAt = DateTime.UtcNow, IsActive = true
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 5m));

        var after = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        var lotTotal = (await _lotRepo.GetActiveByIngredientIdAsync("ing-1")).Sum(l => l.RemainingQuantity);
        Assert.Equal(5m, after.Quantity);
        Assert.Equal(5m, lotTotal);
    }

    [Fact]
    public async Task Sale_InsufficientLots_BuildsOneHonestLineFromLedgerNotRow()
    {
        // Desynced legacy row: row claims 5, the ledger holds 0. The sale must fail
        // with the LEDGER figure, one line, no raw lot-service text, and must not
        // persist the transaction.
        await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 5m);

        StubProductSale();
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildSaleService().CreateTransactionAsync(Sale()));

        var message = ex.Message;
        Assert.Contains("Insufficient ingredient: Red Horse Can 330ml x 24", message);
        Assert.Contains("stock ledger", message);
        Assert.Contains("row shows 5", message);
        Assert.Contains("Adjust Stock", message);
        Assert.DoesNotContain('\n', message);
        // The contradictory old claim ("Available: 5" from the row) must be gone,
        // and the raw lot wording must not leak either.
        Assert.DoesNotContain("Available: 5", message);
        Assert.DoesNotContain("Insufficient stock for", message);

        _dbTransactionStub.Verify(t => t.CommitAsync(default), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task Sale_DeductsOldestReceivedLotFirst_WithShortestExpiryAsTiebreak()
    {
        // Guard: the fix must not disturb FIFO candidate ordering - ReceivedAt ASC,
        // then earliest expiration.
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 3m);
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-older",
            IngredientId = seeded.Id, UnitCost = 10m, InitialQuantity = 1m, RemainingQuantity = 1m,
            ReceivedAt = DateTime.UtcNow.AddDays(-2), ExpirationDate = DateTime.UtcNow.AddDays(30), IsActive = true
        });
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-newer",
            IngredientId = seeded.Id, UnitCost = 10m, InitialQuantity = 1m, RemainingQuantity = 1m,
            ReceivedAt = DateTime.UtcNow.AddDays(-1), ExpirationDate = DateTime.UtcNow.AddDays(1), IsActive = true
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 1m));

        var movements = await _context.StockMovements
            .Where(m => m.MovementType == MovementType.Adjustment)
            .ToListAsync();
        var deduction = movements.Single(m => m.MovementType == MovementType.Adjustment && m.Quantity < 0);
        // Older ReceivedAt wins even though the newer lot expires sooner.
        Assert.Equal("lot-older", deduction.LotId);
    }

    [Fact]
    public async Task Sale_DecimalScales_RequirementVersusLots_CompareCleanly()
    {
        // The desync incident surfaced a scale mismatch (recipe requirement 1.0000
        // vs lot balance 3.00). The comparison must be plain decimal logic.
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 3.00m);
        await _lotService.CreateLotAsync(seeded.Id, new IngredientLotDto
        {
            Supplier = "ACME",
            UnitCost = 10m,
            Quantity = 3.00m
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 3.00m));

        StubProductSale(quantityPerUnit: 1.0000m);
        await BuildSaleService().CreateTransactionAsync(Sale());

        var afterSale = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        Assert.Equal(2.00m, afterSale.Quantity);
    }

    [Fact]
    public async Task Edit_OnStaleHigherRow_LandsRequestedQuantity_RealigningLedgerUp()
    {
        // Legacy desync where the row claims MORE than the ledger holds: row 10,
        // ledger 2. Requesting 9 asks the LEDGER for 9 (+7 lot receipt); the edit
        // lands row == lots == 9, realigning the previously lying row.
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 10m);
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-2", IngredientId = seeded.Id, UnitCost = 10m, InitialQuantity = 2m, RemainingQuantity = 2m,
            ReceivedAt = DateTime.UtcNow, IsActive = true
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 9m));

        var after = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        var lotTotal = (await _lotRepo.GetActiveByIngredientIdAsync("ing-1")).Sum(l => l.RemainingQuantity);
        Assert.Equal(9m, after.Quantity);
        Assert.Equal(9m, lotTotal);
        // The +7 realignment is booked on the ledger as the Purchase receipt it is.
        var movements = await _context.StockMovements.ToListAsync();
        var receipt = movements.Single(m => m.MovementType == MovementType.Purchase);
        Assert.Equal(7m, receipt.Quantity);
    }

    [Fact]
    public async Task Edit_ToZero_DrainsLedgerAndRow()
    {
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", 5m);
        await _lotRepo.AddAsync(new IngredientLot
        {
            Id = "lot-5", IngredientId = seeded.Id, UnitCost = 10m, InitialQuantity = 5m, RemainingQuantity = 5m,
            ReceivedAt = DateTime.UtcNow, IsActive = true
        });

        await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: 0m));

        var after = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        Assert.Equal(0m, after.Quantity);
        var lots = await _lotRepo.GetActiveByIngredientIdAsync("ing-1");
        Assert.Empty(lots.Where(l => l.RemainingQuantity > 0m));
    }

    /// <summary>
    /// LPOS-SL-01 invariant (leader-mandated): EVERY successful quantity edit lands
    /// row.Quantity == activeLotTotal == the requested target - on an increase and a
    /// decrease alike. This is the anti-drift pin: if a future change ever lets the
    /// row and the ledger disagree after a successful edit, it fails here the way the
    /// TA-02 pin guards the import report.
    /// </summary>
    [Theory]
    [InlineData(5.0, 3.0)]   // decrease on a synced row
    [InlineData(5.0, 12.0)]  // increase on a synced row
    [InlineData(2.0, 5.0)]   // legacy desync, row < lots
    [InlineData(10.0, 9.0)]  // legacy desync, row > lots
    public async Task UpdateAsync_Invariant_AnyQuantityEdit_LandsRowEqualsLotsEqualsTarget(
        double seedRow, double target)
    {
        var seeded = await SeedIngredientAsync(_context, "Red Horse Can 330ml x 24", (decimal)seedRow);
        var lotTotalAtSeed = Math.Min((decimal)seedRow, 5m);
        if (lotTotalAtSeed > 0m)
        {
            await _lotRepo.AddAsync(new IngredientLot
            {
                IngredientId = seeded.Id, UnitCost = 10m, InitialQuantity = lotTotalAtSeed,
                RemainingQuantity = lotTotalAtSeed, ReceivedAt = DateTime.UtcNow, IsActive = true
            });
        }

        var result = await _ingredientService.UpdateIngredientAsync("ing-1", Edit(quantity: (decimal)target));

        var ledgerTotal = (await _lotRepo.GetActiveByIngredientIdAsync("ing-1"))
            .Where(l => l.RemainingQuantity > 0m)
            .Sum(l => l.RemainingQuantity);
        var row = (await _ingredientRepo.GetByIdAsync("ing-1"))!;
        Assert.Equal((decimal)target, row.Quantity);
        Assert.Equal((decimal)target, ledgerTotal);
        Assert.Equal(row.Quantity, result.Quantity);
        // The result carries the committed row, and no desync is left behind.
        Assert.Equal(0m, row.Quantity - ledgerTotal);
    }
}
