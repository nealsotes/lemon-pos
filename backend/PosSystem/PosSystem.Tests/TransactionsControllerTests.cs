using Microsoft.AspNetCore.Mvc;
using Moq;
using PosSystem.API.Controllers;
using PosSystem.Core;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Core.Time;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for TransactionsController. The controller previously sat at zero
/// coverage while carrying the sale-creation error table (input validation, 409
/// idempotency conflict, replay-200 vs create-201) and the PH-business-day date
/// plumbing of roadmap item 2 (OT-01): a UTC date from a route/query must be turned
/// into the Philippine wall day/window before it reaches the service.
/// </summary>
public class TransactionsControllerTests
{
    private readonly Mock<ITransactionService> _service = new();
    private readonly TransactionsController _controller;

    public TransactionsControllerTests()
    {
        _controller = new TransactionsController(_service.Object);
    }

    private static object? Prop(object source, string name) =>
        source.GetType().GetProperty(name)?.GetValue(source);

    private static CreateTransactionDto Dto(string? name = null)
    {
        return new CreateTransactionDto
        {
            Items = new List<TransactionItemWriteDto>
            {
                new() { ProductId = "P1", Name = name, Quantity = 1 }
            }
        };
    }

    [Fact]
    public async Task GetTransactions_ReturnsServiceResultAsOk()
    {
        var transactions = new List<Transaction> { new() { Id = 1 }, new() { Id = 2 } };
        _service.Setup(s => s.GetAllTransactionsAsync()).ReturnsAsync(transactions);

        var result = await _controller.GetTransactions();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(transactions, ok.Value);
    }

    [Fact]
    public async Task GetTransaction_KnownId_ReturnsOkWithTransaction()
    {
        var transaction = new Transaction { Id = 5 };
        _service.Setup(s => s.GetTransactionByIdAsync(5)).ReturnsAsync(transaction);

        var result = await _controller.GetTransaction(5);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Same(transaction, ok.Value);
    }

    [Fact]
    public async Task GetTransaction_UnknownId_ReturnsNotFound()
    {
        _service.Setup(s => s.GetTransactionByIdAsync(99)).ReturnsAsync((Transaction?)null);

        var result = await _controller.GetTransaction(99);

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task CreateTransaction_NewSale_Returns201CreatedWithRouteToGetTransaction()
    {
        var dto = Dto();
        var created = new Transaction { Id = 42 };
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(dto, "hdr-key"))
            .ReturnsAsync((created, false));

        var result = await _controller.CreateTransaction(dto, "hdr-key");

        var createdResult = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(201, createdResult.StatusCode);
        Assert.Equal("GetTransaction", createdResult.ActionName);
        Assert.Equal(42, Convert.ToInt32(createdResult.RouteValues?["id"]));
        Assert.Same(created, createdResult.Value);
        _service.Verify(s => s.CreateTransactionFromDtoAsync(dto, "hdr-key"), Times.Once);
    }

    [Fact]
    public async Task CreateTransaction_ReplayedKey_Returns200OkWithStoredSale()
    {
        var dto = Dto();
        var stored = new Transaction { Id = 42 };
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(It.IsAny<CreateTransactionDto>(), It.IsAny<string?>()))
            .ReturnsAsync((stored, true));

        var result = await _controller.CreateTransaction(dto, "hdr-key");

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(200, ok.StatusCode);
        Assert.Same(stored, ok.Value);
    }

    [Fact]
    public async Task CreateTransaction_NullDto_ReturnsBadRequestWithoutCallingService()
    {
        var result = await _controller.CreateTransaction(null, null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Transaction data is required or could not be parsed", Prop(badRequest.Value!, "message"));
        _service.Verify(s => s.CreateTransactionFromDtoAsync(It.IsAny<CreateTransactionDto>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransaction_InvalidModelState_ReturnsBadRequestwithErrors()
    {
        _controller.ModelState.AddModelError("Items", "A line is required");

        var result = await _controller.CreateTransaction(Dto(), null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Validation failed", Prop(badRequest.Value!, "message"));
        var errors = Assert.IsType<List<string>>(Prop(badRequest.Value!, "errors"));
        Assert.Contains("Items: A line is required", errors);
        _service.Verify(s => s.CreateTransactionFromDtoAsync(It.IsAny<CreateTransactionDto>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task CreateTransaction_IdempotencyConflict_Returns409WithExistingId()
    {
        var dto = Dto();
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(dto, It.IsAny<string?>()))
            .ThrowsAsync(new IdempotencyKeyConflictException(
                "An idempotency key already belongs to transaction #7 with a different order. Use a new idempotency key for a different sale.",
                7));

        var result = await _controller.CreateTransaction(dto, "evil-key");

        var conflict = Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal(7, Prop(conflict.Value!, "existingTransactionId"));
        Assert.Contains("already belongs to transaction #7", (string)Prop(conflict.Value!, "message")!);
    }

    [Fact]
    public async Task CreateTransaction_ArgumentException_Returns400WithMessage()
    {
        var dto = Dto();
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(dto, It.IsAny<string?>()))
            .ThrowsAsync(new ArgumentException("Add-on 'Caramel' is not configured for product 'Iced Latte'. The sale was rejected so an unpriced item cannot reach the receipt."));

        var result = await _controller.CreateTransaction(dto, null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains("not configured for product 'Iced Latte'", (string)Prop(badRequest.Value!, "message")!);
    }

    [Fact]
    public async Task CreateTransaction_InvalidOperationException_Returns400WithMessage()
    {
        var dto = Dto();
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(dto, It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("Insufficient stock for product Iced Latte. Required: 2, Available: 1"));

        var result = await _controller.CreateTransaction(dto, null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Contains("Insufficient stock for product Iced Latte", (string)Prop(badRequest.Value!, "message")!);
    }

    [Fact]
    public async Task CreateTransaction_UnexpectedException_Returns400WithGenericPrefix()
    {
        var dto = Dto();
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(dto, It.IsAny<string?>()))
            .ThrowsAsync(new UnauthorizedAccessException("db exploded"));

        var result = await _controller.CreateTransaction(dto, null);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("An error occurred: db exploded", Prop(badRequest.Value!, "message"));
    }

    [Fact]
    public async Task CreateTransaction_AbsentHeader_ForwardsNullToService()
    {
        _service
            .Setup(s => s.CreateTransactionFromDtoAsync(It.IsAny<CreateTransactionDto>(), null))
            .ReturnsAsync((new Transaction { Id = 1 }, false));

        var result = await _controller.CreateTransaction(Dto(), null);

        Assert.IsType<CreatedAtActionResult>(result.Result);
        _service.Verify(s => s.CreateTransactionFromDtoAsync(It.IsAny<CreateTransactionDto>(), null), Times.Once);
    }

    [Fact]
    public async Task GetTransactionsByDate_UtcRouteDate_IsConvertedToPhilippineWallDay()
    {
        // 2026-10-30 23:00 UTC is 2026-10-31 07:00 PHT — the same Philippine day.
        var utc = new DateTime(2026, 10, 30, 23, 0, 0, DateTimeKind.Utc);
        DateTime captured = default;
        _service
            .Setup(s => s.GetTransactionsByDateAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => captured = d)
            .ReturnsAsync(new List<Transaction>());

        await _controller.GetTransactionsByDate(utc);

        Assert.Equal(new DateTime(2026, 10, 31, 7, 0, 0), captured);
        Assert.Equal(DateTimeKind.Unspecified, captured.Kind);
    }

    [Fact]
    public async Task GetTransactionsByDate_NonUtcDate_PassesThroughUnconverted()
    {
        var naive = new DateTime(2026, 10, 31, 0, 0, 0, DateTimeKind.Unspecified);
        DateTime captured = default;
        _service
            .Setup(s => s.GetTransactionsByDateAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => captured = d)
            .ReturnsAsync(new List<Transaction>());

        await _controller.GetTransactionsByDate(naive);

        Assert.Equal(naive, captured);
        Assert.Equal(DateTimeKind.Unspecified, captured.Kind);
    }

    [Fact]
    public async Task GetTransactionsByDateRange_PhQueryDay_BecomesExactUtcHalfOpenWindow()
    {
        DateTime capturedStart = DateTime.MaxValue;
        DateTime capturedEnd = DateTime.MaxValue;
        _service
            .Setup(s => s.GetTransactionsByDateRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .Callback<DateTime, DateTime>((start, end) => { capturedStart = start; capturedEnd = end; })
            .ReturnsAsync(new List<Transaction>());

        await _controller.GetTransactionsByDateRange(
            new DateTime(2026, 10, 31, 0, 0, 0),
            new DateTime(2026, 10, 31, 0, 0, 0));

        // One PH business day: [2026-10-30 16:00Z, 2026-10-31 16:00Z).
        Assert.Equal(new DateTime(2026, 10, 30, 16, 0, 0), capturedStart);
        Assert.Equal(new DateTime(2026, 10, 31, 16, 0, 0), capturedEnd);
        Assert.Equal(DateTimeKind.Utc, capturedStart.Kind);
        Assert.Equal(DateTimeKind.Utc, capturedEnd.Kind);
    }

    [Fact]
    public async Task GetTotalSales_UtcDate_IsConvertedToPhilippineWallDayBeforeSumming()
    {
        var utc = new DateTime(2026, 10, 30, 6, 0, 0, DateTimeKind.Utc);
        DateTime captured = default;
        _service
            .Setup(s => s.GetTotalSalesAsync(It.IsAny<DateTime>()))
            .Callback<DateTime>(d => captured = d)
            .ReturnsAsync(42.5m);

        var result = await _controller.GetTotalSales(utc);

        Assert.Equal(new DateTime(2026, 10, 30, 14, 0, 0), captured);
        Assert.Equal(DateTimeKind.Unspecified, captured.Kind);
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(42.5m, ok.Value);
    }
}