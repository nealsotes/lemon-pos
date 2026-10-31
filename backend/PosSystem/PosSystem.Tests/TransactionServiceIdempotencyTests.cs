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
/// Contract tests for the idempotency handling in TransactionService (roadmap item 1,
/// corruption-source fix): a retry carrying the same IdempotencyKey must replay the
/// stored sale instead of ringing a second charge, and must never alias a different
/// order onto the same key. Concurrency behavior under real InnoDB semantics is
/// covered by a separate MySQL-backed harness; these tests pin the service logic.
/// </summary>
public class TransactionServiceIdempotencyTests
{
    private readonly Mock<ITransactionRepository> _transactionRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IInventoryService> _inventoryService = new();
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IProductIngredientRepository> _productIngredientRepository = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly Mock<IIngredientLotService> _lotService = new();

    private ITransactionService BuildService()
    {
        // The context backs ChangeTracker.Clear() on the transient-lock retry path,
        // which mocked repositories never trigger; an in-memory context is enough.
        var context = new PosSystemDbContext(
            new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<PosSystemDbContext>()
                .UseInMemoryDatabase($"idem-{Guid.NewGuid()}")
                .Options);

        return new TransactionService(
            _transactionRepository.Object,
            _productRepository.Object,
            _inventoryService.Object,
            _lotService.Object,
            _ingredientRepository.Object,
            _productIngredientRepository.Object,
            _unitOfWork.Object,
            context);
    }

    private static Mock<IDbContextTransaction> BeginTransactionStub()
    {
        var tx = new Mock<IDbContextTransaction>();
        tx.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
        tx.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
        return tx;
    }

    private static Transaction Sale(int quantity = 1, decimal price = 50m, decimal serviceFee = 0m, string? idempotencyKey = null)
    {
        return new Transaction
        {
            IdempotencyKey = idempotencyKey,
            PaymentMethod = "cash",
            ServiceFee = serviceFee,
            Total = 0m,
            Items = new List<TransactionItem>
            {
                new()
                {
                    ProductId = "P1",
                    Name = "Iced Latte",
                    Price = price,
                    Quantity = quantity,
                    Temperature = Temperature.None
                }
            }
        };
    }

    private static Transaction Stored(int id, string? idempotencyKey, int quantity = 1, decimal price = 50m, decimal serviceFee = 0m)
    {
        var transaction = Sale(quantity, price, serviceFee, idempotencyKey);
        transaction.Id = id;
        return transaction;
    }

    [Fact]
    public async Task CreateTransactionAsync_SameKeyFound_ReplaysStoredSaleWithoutStockChanges()
    {
        const string key = "sale-001";
        var stored = Stored(id: 42, key);
        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync(stored);

        var result = await BuildService().CreateTransactionAsync(Sale(idempotencyKey: key));

        // Same stored row comes back and no work was done: no transaction, no stock
        // writes, no lot deductions, no second insert.
        Assert.Same(stored, result);
        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Never);
        _productRepository.Verify(p => p.GetByIdAsync(It.IsAny<string>()), Times.Never);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_SameKeyDifferentPayload_ThrowsConflict()
    {
        const string key = "sale-002";
        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync(Stored(id: 7, key, quantity: 1, price: 50m));

        var conflict = await Assert.ThrowsAsync<IdempotencyKeyConflictException>(
            () => BuildService().CreateTransactionAsync(Sale(quantity: 3, idempotencyKey: key)));

        Assert.Equal(7, conflict.ExistingTransactionId);
        // The conflict aborts before any stock or ledger work.
        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Never);
    }

    [Fact]
    public async Task CreateTransactionAsync_EmptyKey_ProcessesNormally()
    {
        // Whitespace key means "not opted in": no dedupe lookup happens at all, and the
        // sale is processed like the old code path.
        _productRepository.Setup(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(new Product { Id = "P1", Name = "Iced Latte", Price = 50m, Stock = 10 });
        _inventoryService
            .Setup(i => i.CheckStockAvailabilityAsync("P1", 1))
            .ReturnsAsync(true);
        _productRepository
            .Setup(p => p.DecrementStockAsync("P1", 1))
            .ReturnsAsync(1);
        _productIngredientRepository
            .Setup(r => r.GetByProductIdAsync("P1"))
            .ReturnsAsync(new List<ProductIngredient>());
        var txStub = BeginTransactionStub();
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(txStub.Object);

        _transactionRepository.Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ReturnsAsync((Transaction t) => t);

        var request = Sale(idempotencyKey: "   ");
        var result = await BuildService().CreateTransactionAsync(request);

        // The caller's instance is processed and stored; no dedupe lookup was ever made.
        Assert.Same(request, result);
        _transactionRepository.Verify(r => r.GetByIdempotencyKeyAsync(It.IsAny<string>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(request), Times.Once);
        txStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_SameKeySamePayload_DifferingOnlyInDerivedFields_StillReplays()
    {
        const string key = "sale-003";
        var stored = Stored(id: 11, key);
        // The retry quotes the server-computed total back; Total is derived by the
        // server and must not veto the replay (AmountReceived/change math likewise).
        var retry = Sale(idempotencyKey: key);
        retry.Total = 50m;
        retry.AmountReceived = 100m;
        retry.Change = 50m;

        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync(stored);

        var result = await BuildService().CreateTransactionAsync(retry);

        Assert.Same(stored, result);
    }

    [Fact]
    public async Task CreateTransactionAsync_SameKeySameLineItemsDifferentFee_ThrowsConflict()
    {
        const string key = "sale-004";
        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync(Stored(id: 9, key, serviceFee: 20m));

        // Service fee is part of what the customer was charged - a different fee on
        // the same key is a different sale and must conflict.
        await Assert.ThrowsAsync<IdempotencyKeyConflictException>(
            () => BuildService().CreateTransactionAsync(Sale(serviceFee: 10m, idempotencyKey: key)));
    }

    [Fact]
    public async Task CreateTransactionAsync_LineOrderDoesNotAffectFingerprint()
    {
        const string key = "sale-005";
        var stored = Stored(id: 12, key);
        stored.Items.Add(new TransactionItem { ProductId = "P2", Name = "Cookie", Price = 30m, Quantity = 1 });
        // Retry arrives with the SAME two lines but in a different order - a common
        // artifact of parallel dict/list assembly - and must still replay.
        var retry = new Transaction
        {
            IdempotencyKey = key,
            PaymentMethod = "cash",
            Total = 0m,
            Items = new List<TransactionItem>
            {
                new() { ProductId = "P2", Name = "Cookie", Price = 30m, Quantity = 1 },
                new() { ProductId = "P1", Name = "Iced Latte", Price = 50m, Quantity = 1 }
            }
        };

        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync(stored);

        var result = await BuildService().CreateTransactionAsync(retry);
        Assert.Same(stored, result);
    }

    [Fact]
    public async Task CreateTransactionAsync_DuplicateKeyOnInsert_ResolvesToStoredSale()
    {
        // Concurrent retry: the pre-check missed (the first request had not committed
        // yet), the unique index on IdempotencyKey rejected the second insert, and the
        // service must surface the stored sale rather than the DB error.
        const string key = "sale-006";
        var stored = Stored(id: 88, key);

        _transactionRepository
            .SetupSequence(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync((Transaction?)null)      // pre-check: nothing stored yet
            .ReturnsAsync(stored);                 // post-rollback: the winner's row

        _productRepository.Setup(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(new Product { Id = "P1", Name = "Iced Latte", Price = 50m, Stock = 10 });

        _inventoryService
            .Setup(i => i.CheckStockAvailabilityAsync("P1", 1))
            .ReturnsAsync(true);

        _productRepository
            .Setup(p => p.DecrementStockAsync("P1", 1))
            .ReturnsAsync(1);

        _productIngredientRepository
            .Setup(r => r.GetByProductIdAsync("P1"))
            .ReturnsAsync(new List<ProductIngredient>());

        var txStub = BeginTransactionStub();
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(txStub.Object);

        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ThrowsAsync(new Microsoft.EntityFrameworkCore.DbUpdateException(
                "An error occurred while updating the entries.",
                new Exception("The SQLite UNIQUE constraint failed: Transactions.IdempotencyKey")));

        var result = await BuildService().CreateTransactionAsync(Sale(idempotencyKey: key));

        Assert.Same(stored, result);
        txStub.Verify(t => t.RollbackAsync(default), Times.Once);
    }

    [Fact]
    public async Task CreateTransactionAsync_DuplicateKeyWithoutStoredRow_SurfacesTheError()
    {
        const string key = "sale-007";

        _transactionRepository
            .SetupSequence(r => r.GetByIdempotencyKeyAsync(key))
            .ReturnsAsync((Transaction?)null)
            .ReturnsAsync((Transaction?)null); // row still absent after rollback

        _productRepository.Setup(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(new Product { Id = "P1", Name = "Iced Latte", Price = 50m, Stock = 10 });

        _inventoryService
            .Setup(i => i.CheckStockAvailabilityAsync("P1", 1))
            .ReturnsAsync(true);

        _productRepository
            .Setup(p => p.DecrementStockAsync("P1", 1))
            .ReturnsAsync(1);

        _productIngredientRepository
            .Setup(r => r.GetByProductIdAsync("P1"))
            .ReturnsAsync(new List<ProductIngredient>());

        var txStub = BeginTransactionStub();
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(txStub.Object);

        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ThrowsAsync(new Microsoft.EntityFrameworkCore.DbUpdateException(
                "An error occurred while updating the entries.",
                new Exception("Duplicate entry 'sale-007' for key 'transactions.IX_transactions_IdempotencyKey'")));

        await Assert.ThrowsAsync<Microsoft.EntityFrameworkCore.DbUpdateException>(
            () => BuildService().CreateTransactionAsync(Sale(idempotencyKey: key)));
        txStub.Verify(t => t.RollbackAsync(default), Times.Once);
    }
}