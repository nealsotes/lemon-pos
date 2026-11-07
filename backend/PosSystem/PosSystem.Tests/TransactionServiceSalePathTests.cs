using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Moq;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for the non-idempotency half of TransactionService.CreateTransactionAsync:
/// the atomic-sale path itself. Validates the ordering that makes a sale atomic —
/// stock validated before decrement, both inventory and snapshot re-checked, zero-row
/// decrements rejected — the recipe aggregation across lines/products, the server-side
/// total math (derivation, overwriting an overquote, tolerance band), the sale-time
/// stamping, and the bounded transient-lock retry (the InnoDB deadlock/lock-wait
/// replay contract; the real database semantics run in the MySQL harness).
/// </summary>
public class TransactionServiceSalePathTests
{
    private readonly Mock<ITransactionRepository> _transactionRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IInventoryService> _inventoryService = new();
    private readonly Mock<IIngredientLotService> _lotService = new();
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IProductIngredientRepository> _productIngredientRepository = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly Mock<IDbContextTransaction> _transactionStub = new();

    private readonly PosSystemDbContext _context = new(
        new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase($"sale-path-{Guid.NewGuid()}")
            .Options);

    private int _addAttempts;

    public TransactionServiceSalePathTests()
    {
        _transactionStub.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
        _transactionStub.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(_transactionStub.Object);
    }

    private TransactionService BuildService()
    {
        return new TransactionService(
            _transactionRepository.Object,
            _productRepository.Object,
            _inventoryService.Object,
            _lotService.Object,
            _ingredientRepository.Object,
            _productIngredientRepository.Object,
            _unitOfWork.Object,
            _context);
    }

    private static Product Product(string id = "P1", string name = "Iced Latte", decimal price = 50m, int stock = 10)
    {
        return new Product { Id = id, Name = name, Price = price, Category = "Coffee", Stock = stock };
    }

    private static Transaction Sale(decimal price = 50m, int quantity = 1, decimal serviceFee = 0m, decimal? total = null)
    {
        var transaction = new Transaction
        {
            PaymentMethod = "cash",
            ServiceFee = serviceFee,
            Total = total ?? 0m,
            Items = new List<TransactionItem>()
        };
        transaction.Items.Add(new TransactionItem
        {
            ProductId = "P1",
            Name = "Iced Latte",
            Price = price,
            Quantity = quantity,
            Temperature = Temperature.None
        });
        return transaction;
    }

    private void StubHappyProductSale(string productId = "P1", int stock = 10, int decrementRows = 1)
    {
        _productRepository.Setup(p => p.GetByIdAsync(productId)).ReturnsAsync(Product(stock: stock));
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync(productId, It.IsAny<int>())).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync(productId, It.IsAny<int>())).ReturnsAsync(decrementRows);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync(productId)).ReturnsAsync(new List<ProductIngredient>());
        _transactionRepository.Setup(r => r.AddAsync(It.IsAny<Transaction>())).ReturnsAsync((Transaction t) => t);
    }

    [Fact]
    public async Task CreateTransactionAsync_ProductNotFound_ThrowsRollsBackAndStoresNothing()
    {
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync((Product?)null);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionAsync(Sale()));

        Assert.Contains("Product with ID P1 not found", ex.Message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Never);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_ProductRemovedAfterValidation_ThrowsAtDecrementLoop()
    {
        // The availability loop read the product fine; the decrement loop's re-read
        // finds it gone (deleted between the two reads): the second guard fires.
        _productRepository.SetupSequence(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(Product())
            .ReturnsAsync((Product?)null);
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 1)).ReturnsAsync(true);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionAsync(Sale()));

        Assert.Contains("Product with ID P1 not found", ex.Message);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_InventoryCheckFails_ThrowsBeforeAnyDecrement()
    {
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product(stock: 1));
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 2)).ReturnsAsync(false);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 2)));

        Assert.Contains("Insufficient stock for product Iced Latte. Required: 2, Available: 1", ex.Message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_ConcurrentSnapshotDrainedBelowRequirement_ThrowsSecondCheck()
    {
        // CheckStockAvailability answered true, but the product row read inside the
        // decrement loop shows the race already drained the stock: fail closed here.
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product(stock: 1));
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 2)).ReturnsAsync(true);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 2)));

        Assert.Contains("Insufficient stock for product Iced Latte. Current: 1, Required: 2", ex.Message);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_DecrementMissesTheRow_ThrowsWithRereadBalance()
    {
        // The guarded decrement matched zero rows: the stock moved under us. The
        // message quotes the re-read balance, not the stale snapshot. The product row
        // is read three times: availability loop, decrement loop, failure re-read.
        _productRepository.SetupSequence(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(Product(stock: 3))
            .ReturnsAsync(Product(stock: 3))
            .ReturnsAsync(Product(stock: 0));
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 3)).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync("P1", 3)).ReturnsAsync(0);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 3)));

        Assert.Contains("Failed to update stock for product Iced Latte. Current stock: 0, Required: 3", ex.Message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_RepeatedLinesOfSameProduct_AggregateIntoOneDecrement()
    {
        var cart = Sale(quantity: 2);
        cart.Items.Add(new TransactionItem { ProductId = "P1", Name = "Iced Latte", Price = 50m, Quantity = 3 });
        StubHappyProductSale();

        var result = await BuildService().CreateTransactionAsync(cart);

        Assert.Same(cart, result);
        _productRepository.Verify(p => p.DecrementStockAsync("P1", 5), Times.Once);
        _inventoryService.Verify(i => i.CheckStockAvailabilityAsync("P1", 5), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_RecipeIngredientMissing_Throws()
    {
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product());
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 1)).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync("P1", 1)).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P1")).ReturnsAsync(new List<ProductIngredient>
        {
            new() { IngredientId = "I9", QuantityPerUnit = 0.5m }
        });
        _ingredientRepository.Setup(r => r.GetByIdAsync("I9")).ReturnsAsync((Ingredient?)null);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale()));

        Assert.Contains("Ingredient with ID I9 not found", ex.Message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(), It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_IngredientShortfall_ThrowsNamedShortfall()
    {
        StubIngredientsFor("P1", saleQuantity: 4); // 0.5 L per unit x 4 sold = 2 L required
        _ingredientRepository.Setup(r => r.GetByIdAsync("M1")).ReturnsAsync(MilkStock(1.5m));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 4)));

        Assert.Contains("Insufficient ingredient: Milk. Required: 2.0 L, Available: 1.5", ex.Message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _lotService.Verify(l => l.DeductFifoAsync(It.IsAny<string>(), It.IsAny<decimal>(), It.IsAny<MovementType>(), It.IsAny<string?>(), It.IsAny<string?>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_LotServiceShortfall_SurfacesLedgerShortfall()
    {
        StubIngredientsFor("P1", saleQuantity: 2); // required = 1 L
        _ingredientRepository.Setup(r => r.GetByIdAsync("M1")).ReturnsAsync(MilkStock(2m));
        _lotService
            .Setup(l => l.DeductFifoAsync("M1", 1m, MovementType.Sale, "POS Sale", It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("Insufficient stock for Milk. Required: 1, Available: 0.5"));
        // The stale row says 2 while the ledger holds 0.5 - the honest catch reads
        // the LOT-side availability, not the row.
        _lotService.Setup(l => l.GetLotsAsync("M1")).ReturnsAsync(new[]
        {
            new IngredientLot { IngredientId = "M1", UnitCost = 10m, InitialQuantity = 0.5m, RemainingQuantity = 0.5m, ReceivedAt = DateTime.UtcNow, IsActive = true }
        });

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 2)));

        // One cashier-readable line built from the LEDGER figure: the ledger holds
        // 0.5 while the stale row claims 2 - both stated, plus the reconciliation
        // hint. No raw lot-service text, and no line break (POS UI).
        var message = ex.Message;
        Assert.Contains("Insufficient ingredient: Milk. Required: 1.0, Available: 0.5 (stock ledger)", message);
        Assert.Contains("The item row shows 2; use Adjust Stock to reconcile or re-import with a stock entry", message);
        Assert.DoesNotContain('\n', message);
        Assert.DoesNotContain("Insufficient stock for", message);
        _transactionStub.Verify(t => t.RollbackAsync(default), Times.Once);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_RecipeLinesSummedAcrossProducts_SingleFifoCallPerIngredient()
    {
        // P1 (x2) needs 0.5 L/unit and P2 (x2) needs 2 L/unit of the same Milk: the
        // sweep calls the lot service ONCE with the summed 5 L, not per line.
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product());
        _productRepository.Setup(p => p.GetByIdAsync("P2")).ReturnsAsync(Product(id: "P2", name: "Toast", price: 30m, stock: 10));
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync(It.IsAny<string>(), It.IsAny<int>())).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>())).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P1")).ReturnsAsync(new List<ProductIngredient>
        {
            new() { IngredientId = "M1", QuantityPerUnit = 0.5m }
        });
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P2")).ReturnsAsync(new List<ProductIngredient>
        {
            new() { IngredientId = "M1", QuantityPerUnit = 2m }
        });
        _ingredientRepository.Setup(r => r.GetByIdAsync("M1")).ReturnsAsync(new Ingredient
        {
            Id = "M1", Name = "Milk", Unit = "L", Quantity = 10m
        });
        _transactionRepository.Setup(r => r.AddAsync(It.IsAny<Transaction>())).ReturnsAsync((Transaction t) => t);

        var cart = Sale(); // P1 x1; one more P1 line and 2x P2 added below
        cart.Items.Add(new TransactionItem { ProductId = "P1", Name = "Iced Latte", Price = 50m, Quantity = 1 });
        cart.Items.Add(new TransactionItem { ProductId = "P2", Name = "Toast", Price = 30m, Quantity = 2 });

        await BuildService().CreateTransactionAsync(cart);

        // 0.5 x 2 (both P1 lines) + 2 x 2 (P2) = 5 L of the same milk, one sweep call.
        _lotService.Verify(
            l => l.DeductFifoAsync("M1", 5m, MovementType.Sale, "POS Sale", It.IsAny<string?>()),
            Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_ZeroTotal_IsRecomputedWithRounding()
    {
        StubHappyProductSale();
        var cart = Sale(price: 12.305m); // net subtotal 12.305, fee 0 -> 12.31 AwayFromZero
        cart.Items.Single().Discount = null;

        var result = await BuildService().CreateTransactionAsync(cart);

        Assert.Equal(12.31m, result.Total);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_ClientTotalBeyondTolerance_IsOverwrittenWithServerExpectation()
    {
        // Expected = price x qty + fee = 105.25; the client quoted 999 (tampered or stale).
        StubHappyProductSale(stock: 10);
        var cart = Sale(price: 105.25m, total: 999m);

        var result = await BuildService().CreateTransactionAsync(cart);

        Assert.Equal(105.25m, result.Total);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_ClientTotalWithinTolerance_IsKeptAsQuoted()
    {
        // A 0.04 peso drift stays within the 0.05 boundary and is accepted as quoted
        // (the drift is usually float noise from an old client build, not tampering).
        StubHappyProductSale();
        var cart = Sale(price: 105.25m, total: 105.29m);

        var result = await BuildService().CreateTransactionAsync(cart);

        Assert.Equal(105.29m, result.Total);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_ServerFeeAndDiscountFeedTheTotal()
    {
        StubHappyProductSale();
        var cart = Sale(price: 100m, quantity: 2, serviceFee: 10m);
        cart.Items.Single().Discount = new DiscountInfo { Type = "promo", Percentage = 0m, Amount = 15m };

        var result = await BuildService().CreateTransactionAsync(cart);

        // Subtotal 200 - 15 discount + 10 fee = 195.
        Assert.Equal(195m, result.Total);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_WithoutOccurredAt_StampsUtcSalesTime()
    {
        StubHappyProductSale();

        var result = await BuildService().CreateTransactionAsync(Sale());

        Assert.InRange((result.Timestamp - DateTime.UtcNow).TotalSeconds, -30, 30);
    }

    [Fact]
    public async Task CreateTransactionAsync_WithOccurredAt_UsesTheOriginalSaleTime()
    {
        // Offline replay: the queued sale keeps its rung-up time, not the sync time.
        StubHappyProductSale();
        var originalSaleTime = DateTime.UtcNow.AddHours(-3);

        var result = await BuildService().CreateTransactionAsync(Sale(), originalSaleTime);

        Assert.Equal(originalSaleTime, result.Timestamp);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_TransientDeadlock_RetriesTheWholeSaleOnAFreshTransaction()
    {
        // Attempt 1: the insert dies as a MySQL deadlock victim (rolled back
        // server-side); attempt 2 reruns the identical sale and commits.
        var cart = Sale();
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product());
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 1)).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync("P1", 1)).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P1")).ReturnsAsync(new List<ProductIngredient>());

        var firstStub = new Mock<IDbContextTransaction>();
        firstStub.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
        firstStub.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
        _unitOfWork.SetupSequence(u => u.BeginTransactionAsync())
            .ReturnsAsync(firstStub.Object)
            .ReturnsAsync(_transactionStub.Object);

        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ReturnsAsync((Transaction t) =>
            {
                var attemptCount = Interlocked.Increment(ref _addAttempts);
                if (attemptCount == 1)
                {
                    // The message text is what the retry detector keys on (and what
                    // InnoDB actually sends); a thrown delegate surfaces it verbatim.
                    throw new Exception("Deadlock found when trying to get lock; try restarting transaction");
                }
                t.Id = 3; // the repository stamps the generated id on the entity
                return t;
            });

        var result = await BuildService().CreateTransactionAsync(cart);

        Assert.Same(cart, result);
        Assert.Equal(3, result.Id);
        // The deadlocked attempt rolled back on the fresh transaction; the rerun
        // committed and exactly one sale landed.
        firstStub.Verify(t => t.RollbackAsync(default), Times.Once);
        firstStub.Verify(t => t.CommitAsync(default), Times.Never);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Exactly(2));
        _productRepository.Verify(p => p.DecrementStockAsync("P1", 1), Times.Exactly(2));
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Exactly(2));
    }

    [Fact]
    public async Task CreateTransactionAsync_TransientDeadlock_BeyondThreeAttempts_Surfaces()
    {
        // Attempts 1 and 2 rerun with a fresh transaction; on attempt 3 the bound is
        // exhausted (retry only while attempt < 3) and the lock failure surfaces to
        // the caller. Every victim transaction was rolled back.
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(Product());
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync("P1", 1)).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync("P1", 1)).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync("P1")).ReturnsAsync(new List<ProductIngredient>());

        var attemptStubs = new List<Mock<IDbContextTransaction>>();
        var sequence = _unitOfWork.SetupSequence(u => u.BeginTransactionAsync());
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            var stub = new Mock<IDbContextTransaction>();
            stub.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
            stub.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
            sequence = sequence.ReturnsAsync(stub.Object);
            attemptStubs.Add(stub);
        }

        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ThrowsAsync(new Exception("Lock wait timeout exceeded; try restarting transaction"));

        await Assert.ThrowsAsync<Exception>(
            () => BuildService().CreateTransactionAsync(Sale()));

        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Exactly(3));
        Assert.All(attemptStubs, stub => stub.Verify(t => t.RollbackAsync(default), Times.Once));
    }

    private void StubIngredientsFor(string productId, int saleQuantity)
    {
        _productRepository.Setup(p => p.GetByIdAsync(productId)).ReturnsAsync(Product());
        _inventoryService.Setup(i => i.CheckStockAvailabilityAsync(productId, It.IsAny<int>())).ReturnsAsync(true);
        _productRepository.Setup(p => p.DecrementStockAsync(productId, It.IsAny<int>())).ReturnsAsync(1);
        _productIngredientRepository.Setup(r => r.GetByProductIdAsync(productId)).ReturnsAsync(new List<ProductIngredient>
        {
            new() { IngredientId = "M1", QuantityPerUnit = 0.5m }
        });
    }

    private Ingredient MilkStock(decimal quantity) => new()
    {
        Id = "M1", Name = "Milk", Unit = "L", Quantity = quantity
    };
}