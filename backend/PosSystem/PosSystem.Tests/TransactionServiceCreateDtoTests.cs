using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Moq;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for the write-DTO create path (roadmap item 2, RC-09). The client
/// states WHAT was sold; the server states what it cost — prices, add-on prices and
/// the total are resolved from the catalog and nothing the client sends as money is
/// trusted. Also pins the offline-replay sale-time validation (offline spec §7.1) and
/// the replay flag returned to the controller.
/// </summary>
public class TransactionServiceCreateDtoTests
{
    private const string DefaultKey = "sale-key-001";

    private readonly Mock<ITransactionRepository> _transactionRepository = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IInventoryService> _inventoryService = new();
    private readonly Mock<IIngredientLotService> _lotService = new();
    private readonly Mock<IIngredientRepository> _ingredientRepository = new();
    private readonly Mock<IProductIngredientRepository> _productIngredientRepository = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly Mock<IDbContextTransaction> _transactionStub = new();

    private TransactionService BuildService(IConfiguration? configuration = null)
    {
        _transactionStub.Setup(t => t.CommitAsync(default)).Returns(Task.CompletedTask);
        _transactionStub.Setup(t => t.RollbackAsync(default)).Returns(Task.CompletedTask);
        _unitOfWork.Setup(u => u.BeginTransactionAsync()).ReturnsAsync(_transactionStub.Object);

        var context = new PosSystemDbContext(
            new DbContextOptionsBuilder<PosSystemDbContext>()
                .UseInMemoryDatabase($"dto-{Guid.NewGuid()}")
                .Options);

        return new TransactionService(
            _transactionRepository.Object,
            _productRepository.Object,
            _inventoryService.Object,
            _lotService.Object,
            _ingredientRepository.Object,
            _productIngredientRepository.Object,
            _unitOfWork.Object,
            context,
            configuration);
    }

    private static Product CatalogProduct(
        string id = "P1",
        string name = "Iced Latte",
        decimal price = 50m,
        decimal? hotPrice = null,
        decimal? coldPrice = null,
        List<AddOnDto>? addOns = null)
    {
        var product = new Product
        {
            Id = id,
            Name = name,
            Price = price,
            HotPrice = hotPrice,
            ColdPrice = coldPrice,
            Category = "Coffee",
            Stock = 10
        };
        if (addOns != null)
        {
            product.AddOns = addOns;
        }
        return product;
    }

    private void StubPlainSale(Product product, string productId = "P1")
    {
        _productRepository.Setup(p => p.GetByIdAsync(productId)).ReturnsAsync(product);
        _inventoryService
            .Setup(i => i.CheckStockAvailabilityAsync(productId, It.IsAny<int>()))
            .ReturnsAsync(true);
        _productRepository
            .Setup(p => p.DecrementStockAsync(productId, It.IsAny<int>()))
            .ReturnsAsync(1);
        _productIngredientRepository
            .Setup(r => r.GetByProductIdAsync(productId))
            .ReturnsAsync(new List<ProductIngredient>());
        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .ReturnsAsync((Transaction t) => t);
    }

    private static CreateTransactionDto Dto(
        string productId = "P1",
        int quantity = 2,
        Temperature temperature = Temperature.None,
        decimal serviceFee = 0m)
    {
        return new CreateTransactionDto
        {
            Items = new List<TransactionItemWriteDto>
            {
                new() { ProductId = productId, Name = "stale client name", Quantity = quantity, Temperature = temperature }
            },
            ServiceFee = serviceFee
        };
    }

    private Transaction? _addedTransaction;

    private void CaptureAddedTransaction()
    {
        _transactionRepository
            .Setup(r => r.AddAsync(It.IsAny<Transaction>()))
            .Callback<Transaction>(t => _addedTransaction = t)
            .ReturnsAsync((Transaction t) => t);
    }

    [Fact]
    public async Task FromDto_NewSale_ServerResolvesMoneyAndMapsOnlyTheFacts()
    {
        // Product Price 50, HotPrice 58; catalog add-on "Espresso Shot" at 8.00, asked
        // for once per unit -> line price 58 + 8 = 66; total = 66 x 2 + 10 fee = 142.
        var product = CatalogProduct(hotPrice: 58m, addOns: new List<AddOnDto> { new() { Name = "Espresso Shot", Price = 8m } });
        StubPlainSale(product);
        CaptureAddedTransaction();

        var dto = Dto(quantity: 2, temperature: Temperature.Hot, serviceFee: 10m);
        dto.Items.Single().AddOns = new List<AddOn> { new() { Name = "Espresso Shot", Price = 999m, Quantity = 1 } };
        dto.PaymentMethod = " card ";
        dto.CustomerInfo = new CustomerInfo { Name = "Ana" };
        dto.Notes = "less sugar";
        dto.AmountReceived = 200m;
        dto.Change = 58m;

        var (created, isReplay) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        // The client's quoted add-on price (999) was never trusted; Total is derived.
        Assert.False(isReplay);
        Assert.Same(_addedTransaction, created);
        var line = created.Items.Single();
        Assert.Equal(66m, line.Price);
        Assert.Equal(50m, line.BasePrice);
        Assert.Equal("Iced Latte", line.Name);           // from the catalog, not the client
        Assert.Equal("Coffee", line.Category);
        Assert.Equal(Temperature.Hot, line.Temperature);
        var addOn = Assert.Single(line.AddOns);
        Assert.Equal("Espresso Shot", addOn.Name);
        Assert.Equal(8m, addOn.Price);
        Assert.Equal(1, addOn.Quantity);
        Assert.Equal(142.00m, created.Total);            // 66 x 2 + 10, rounded to the money scale
        Assert.Equal("completed", created.Status);       // a POST is always a completed sale
        Assert.Equal("card", created.PaymentMethod);     // trimmed
        Assert.Equal("less sugar", created.Notes);
        Assert.Equal(200m, created.AmountReceived);
        Assert.Equal(58m, created.Change);
        Assert.Equal("Ana", created.CustomerInfo.Name);
        Assert.Null(created.IdempotencyKey);
        Assert.InRange((created.Timestamp - DateTime.UtcNow).TotalSeconds, -30, 30);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Once);
    }

    [Fact]
    public async Task FromDto_MissingVariantPrice_FallsBackToCatalogPrice()
    {
        StubPlainSale(CatalogProduct()); // no HotPrice/ColdPrice configured

        var dto = Dto(quantity: 1, temperature: Temperature.Cold);

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);
        Assert.Equal(50m, created.Items.Single().Price);
    }

    [Fact]
    public async Task FromDto_BlankOptionalFields_AreNormalized()
    {
        StubPlainSale(CatalogProduct());

        var dto = Dto(quantity: 1);
        dto.PaymentMethod = "   "; // blank -> "cash"
        dto.Notes = null;

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.Equal("cash", created.PaymentMethod);
        Assert.Equal(string.Empty, created.Notes);
        Assert.NotNull(created.CustomerInfo);
        Assert.Equal(string.Empty, created.CustomerInfo.Name);
    }

    [Fact]
    public async Task FromDto_HeaderKeyWinsOverBodyKey()
    {
        StubPlainSale(CatalogProduct());
        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync("hdr-key"))
            .ReturnsAsync((Transaction?)null);

        var dto = Dto(quantity: 1);
        dto.IdempotencyKey = "body-key";

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, "hdr-key");

        Assert.Equal("hdr-key", created.IdempotencyKey);
        _transactionRepository.Verify(r => r.GetByIdempotencyKeyAsync("hdr-key"), Times.Once);
        _transactionRepository.Verify(r => r.GetByIdempotencyKeyAsync("body-key"), Times.Never);
    }

    [Fact]
    public async Task FromDto_BodyKeyUsedWhenHeaderAbsent()
    {
        StubPlainSale(CatalogProduct());
        _transactionRepository
            .Setup(r => r.GetByIdempotencyKeyAsync("body-key"))
            .ReturnsAsync((Transaction?)null);

        var dto = Dto(quantity: 1);
        dto.IdempotencyKey = " body-key ";

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.Equal("body-key", created.IdempotencyKey);
    }

    [Fact]
    public async Task FromDto_KeyLongerThan100Characters_Throws()
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(Dto(), new string('k', 101)));

        // The validation fires before any lookup or write.
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_NullDto_Throws()
    {
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => BuildService().CreateTransactionFromDtoAsync(null!, null));
    }

    [Fact]
    public async Task FromDto_NoItems_ThrowsBeforeAnyWrite()
    {
        var dto = new CreateTransactionDto { Items = new List<TransactionItemWriteDto>() };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("at least one item", ex.Message);
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Never);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_NegativeServiceFee_Throws()
    {
        var dto = Dto(serviceFee: -1m);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("ServiceFee cannot be negative", ex.Message);
        VerifyNoSaleWrite();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task FromDto_LineWithBlankProductId_Throws(string productId)
    {
        var dto = new CreateTransactionDto
        {
            Items = new List<TransactionItemWriteDto> { new() { ProductId = productId, Quantity = 1 } }
        };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("Item is missing ProductId", ex.Message);
        VerifyNoSaleWrite();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-2)]
    public async Task FromDto_LineQuantityNotPositive_Throws(int quantity)
    {
        var dto = Dto(quantity: quantity);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("'P1' has invalid quantity", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_UnknownProduct_Throws()
    {
        _productRepository.Setup(p => p.GetByIdAsync("P9")).ReturnsAsync((Product?)null);
        var dto = Dto(productId: "P9", quantity: 1);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("Product with ID P9 not found", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_UnknownAddOn_ThrowsRatherThanCreatingAnUnpricedSale()
    {
        StubPlainSale(CatalogProduct()); // catalog add-ons: none

        var dto = Dto(quantity: 1);
        dto.Items.Single().AddOns = new List<AddOn> { new() { Name = "Ghost Shot", Price = 5m, Quantity = 1 } };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("Add-on 'Ghost Shot' is not configured for product 'Iced Latte'", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_AddOnQuantityBelowOne_IsClampedToOneUnit()
    {
        var product = CatalogProduct(addOns: new List<AddOnDto> { new() { Name = "Shot", Price = 5m } });
        StubPlainSale(product);

        var dto = Dto(quantity: 2);
        dto.Items.Single().AddOns = new List<AddOn> { new() { Name = "Shot", Price = 5m, Quantity = 0 } };

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        // One add-on per unit, not "zero costs nothing": the money must still land.
        var addOn = Assert.Single(created.Items.Single().AddOns);
        Assert.Equal(1, addOn.Quantity);
        Assert.Equal(5m, addOn.Price);
        Assert.Equal(55m, created.Items.Single().Price);
        Assert.Equal(110m, created.Total);
    }

    [Fact]
    public async Task FromDto_AddOnQuantityAboveTwenty_Throws()
    {
        var product = CatalogProduct(addOns: new List<AddOnDto> { new() { Name = "Shot", Price = 5m } });
        StubPlainSale(product);

        var dto = Dto(quantity: 1);
        dto.Items.Single().AddOns = new List<AddOn> { new() { Name = "Shot", Price = 5m, Quantity = 21 } };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("add-on quantity 21 is not a plausible per-unit count", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_PercentageOnlyDiscount_DerivesAmount()
    {
        // Line amount = (50 + 5 add-on) x 2 = 110; 10% -> 11.00 derived, not dropped.
        var product = CatalogProduct(addOns: new List<AddOnDto> { new() { Name = "Shot", Price = 5m } });
        StubPlainSale(product);

        var dto = Dto(quantity: 2);
        dto.Items.Single().AddOns = new List<AddOn> { new() { Name = "Shot", Price = 5m, Quantity = 1 } };
        dto.Items.Single().Discount = new DiscountInfo { Type = "senior", Percentage = 10m, Amount = 0m };

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        var discount = created.Items.Single().Discount;
        Assert.NotNull(discount);
        Assert.Equal(11.00m, discount!.Amount);
        Assert.Equal("senior", discount.Type);
        Assert.Equal(110m - 11m, created.Total); // subtotal minus derived discount
    }

    [Fact]
    public async Task FromDto_ExplicitAmountDiscount_IsKeptAsGiven()
    {
        StubPlainSale(CatalogProduct());

        var dto = Dto(quantity: 2); // line gross 100
        dto.Items.Single().Discount = new DiscountInfo { Type = "custom", Percentage = 30m, Amount = 8m };

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        // Amount > 0 wins: the explicit peso amount is authoritative, not the percentage.
        Assert.Equal(8m, created.Items.Single().Discount!.Amount);
        Assert.Equal(92m, created.Total);
    }

    [Fact]
    public async Task FromDto_AllZeroDiscount_IsDropped()
    {
        StubPlainSale(CatalogProduct());

        var dto = Dto(quantity: 1);
        dto.Items.Single().Discount = new DiscountInfo { Percentage = 0m, Amount = 0m };

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.Null(created.Items.Single().Discount);
        Assert.Equal(50m, created.Total);
    }

    [Fact]
    public async Task FromDto_DiscountExceedingLineAmount_Throws()
    {
        StubPlainSale(CatalogProduct());

        var dto = Dto(quantity: 2); // line gross 100
        dto.Items.Single().Discount = new DiscountInfo { Percentage = 0m, Amount = 100.01m };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("line discount 100.01 exceeds the line amount 100.00", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_NegativeDiscountAmount_Throws()
    {
        StubPlainSale(CatalogProduct());

        var dto = Dto(quantity: 2);
        dto.Items.Single().Discount = new DiscountInfo { Percentage = 0m, Amount = -0.01m };

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("exceeds the line amount", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_OccurredAt_InTheFuture_Throws()
    {
        StubPlainSale(CatalogProduct());
        var dto = Dto(quantity: 1);
        dto.OccurredAt = DateTime.UtcNow.AddMinutes(3);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("is in the future", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_OccurredAt_OlderThanDefaultBackdateWindow_Throws()
    {
        StubPlainSale(CatalogProduct());
        var dto = Dto(quantity: 1);
        dto.OccurredAt = DateTime.UtcNow.AddDays(-8); // default window is 7 days

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService().CreateTransactionFromDtoAsync(dto, null));

        Assert.Contains("older than 7 days and cannot be booked", ex.Message);
        VerifyNoSaleWrite();
    }

    [Fact]
    public async Task FromDto_OccurredAt_WithinBackdateWindow_IsAccepted()
    {
        StubPlainSale(CatalogProduct());
        var saleTime = DateTime.UtcNow.AddHours(-6);
        var dto = Dto(quantity: 1);
        dto.OccurredAt = saleTime;

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.Equal(saleTime, created.Timestamp);
    }

    [Fact]
    public async Task FromDto_OccurredAt_NaiveValue_IsTreatedAsUtc()
    {
        StubPlainSale(CatalogProduct());
        var naive = DateTime.SpecifyKind(DateTime.UtcNow.AddHours(-2), DateTimeKind.Unspecified);
        var dto = Dto(quantity: 1);
        dto.OccurredAt = naive;

        var (created, _) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.Equal(naive, created.Timestamp);
        Assert.Equal(DateTimeKind.Utc, created.Timestamp.Kind);
    }

    [Fact]
    public async Task FromDto_MaxSaleAgeDays_IsReadableFromConfiguration()
    {
        // Backed by a real configuration chain (as production is) — the binder's
        // GetValue path needs an actual provider, not a bare mock.
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Offline:MaxSaleAgeDays"] = "1"
            })
            .Build();
        StubPlainSale(CatalogProduct());

        var stale = Dto(quantity: 1);
        stale.OccurredAt = DateTime.UtcNow.AddDays(-2);
        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => BuildService(configuration).CreateTransactionFromDtoAsync(stale, null));
        Assert.Contains("older than 1 days and cannot be booked", ex.Message);

        var near = Dto(quantity: 1);
        near.OccurredAt = DateTime.UtcNow.AddHours(-12); // within the 1-day window
        var (created, _) = await BuildService(configuration).CreateTransactionFromDtoAsync(near, null);
        Assert.Equal(near.OccurredAt, created.Timestamp);
    }

    [Fact]
    public async Task FromDto_Replay_SamePayload_ReturnsStoredSaleAndReportsIt()
    {
        var stored = new Transaction
        {
            Id = 9,
            IdempotencyKey = DefaultKey,
            ServiceFee = 0m,
            Items = new List<TransactionItem> { new() { ProductId = "P1", Name = "Iced Latte", Price = 50m, Quantity = 1 } }
        };
        _productRepository.Setup(p => p.GetByIdAsync("P1"))
            .ReturnsAsync(CatalogProduct());
        _transactionRepository.Setup(r => r.GetByIdempotencyKeyAsync(DefaultKey)).ReturnsAsync(stored);

        var dto = Dto(quantity: 1);
        dto.IdempotencyKey = DefaultKey;

        var (created, isReplay) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        Assert.True(isReplay);
        Assert.Same(stored, created);
        // A replay books no further writes of any kind.
        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Never);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    [Fact]
    public async Task FromDto_Replay_IgnoresLineAndAddOnOrderAndServerDerivedFields()
    {
        // Stored: two lines in one order with the espresso shot listed after caramel;
        // retry: same payload with lines swapped and add-ons reordered, quoting a
        // different, stale total/amount. The payload fingerprint is order-insensitive
        // over client-driven charge inputs only (Total/AmountReceived are derived).
        var stored = new Transaction
        {
            Id = 11,
            IdempotencyKey = DefaultKey,
            ServiceFee = 5m,
            Items = new List<TransactionItem>
            {
                new()
                {
                    ProductId = "P1", Name = "Iced Latte", Price = 61m, Quantity = 2,
                    Temperature = Temperature.None,
                    AddOns = new List<AddOn>
                    {
                        new() { Name = "Caramel", Price = 3m, Quantity = 2 },
                        new() { Name = "Espresso Shot", Price = 5m, Quantity = 1 }
                    },
                    Discount = new DiscountInfo { Type = "senior", Percentage = 10m, Amount = 12.20m }
                },
                new()
                {
                    ProductId = "P2", Name = "Cookie", Price = 30m, Quantity = 1,
                    Temperature = Temperature.None
                }
            }
        };
        var product1 = CatalogProduct(addOns: new List<AddOnDto>
        {
            new() { Name = "Caramel", Price = 3m },
            new() { Name = "Espresso Shot", Price = 5m }
        });
        var product2 = CatalogProduct(id: "P2", name: "Cookie", price: 30m);
        _productRepository.Setup(p => p.GetByIdAsync("P1")).ReturnsAsync(product1);
        _productRepository.Setup(p => p.GetByIdAsync("P2")).ReturnsAsync(product2);
        _transactionRepository.Setup(r => r.GetByIdempotencyKeyAsync(DefaultKey)).ReturnsAsync(stored);

        var dto = new CreateTransactionDto
        {
            IdempotencyKey = DefaultKey,
            ServiceFee = 5m,
            Items = new List<TransactionItemWriteDto>
            {
                new()
                {
                    ProductId = "P2", Name = "irrelevant", Quantity = 1, Price = 999m
                },
                new()
                {
                    ProductId = "P1", Name = "irrelevant", Quantity = 2,
                    AddOns = new List<AddOn>
                    {
                        new() { Name = "Espresso Shot", Price = 5m, Quantity = 1 },
                        new() { Name = "Caramel", Price = 3m, Quantity = 2 }
                    },
                    Discount = new DiscountInfo { Type = "senior", Percentage = 10m, Amount = 0m }
                }
            }
        };
        dto.AmountReceived = 1000m;
        dto.Change = 885.2m;

        var (created, isReplay) = await BuildService().CreateTransactionFromDtoAsync(dto, null);

        _transactionRepository.Verify(r => r.GetByIdempotencyKeyAsync(DefaultKey), Times.Once);
        Assert.True(isReplay);
        Assert.Same(stored, created);
        _unitOfWork.Verify(u => u.BeginTransactionAsync(), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }

    private void VerifyNoSaleWrite()
    {
        _transactionStub.Verify(t => t.CommitAsync(default), Times.Never);
        _productRepository.Verify(p => p.DecrementStockAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _transactionRepository.Verify(r => r.AddAsync(It.IsAny<Transaction>()), Times.Never);
    }
}