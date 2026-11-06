using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PosSystem.API.Controllers;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Repositories;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Soft-delete bulk path for stock items: only ACTIVE ingredients are deactivated,
/// already-inactive and nonexistent ids do not count, unrelated rows are untouched,
/// and the honest deleted count is returned all the way to the controller.
/// </summary>
public class IngredientBulkDeleteTests
{
    private readonly List<Guid> _databases = new();

    private PosSystemDbContext NewContext()
    {
        var context = new PosSystemDbContext(
            new DbContextOptionsBuilder<PosSystemDbContext>()
                .UseInMemoryDatabase($"bulk-ingredient-{Guid.NewGuid()}")
                .Options);
        _databases.Add(Guid.NewGuid());
        return context;
    }

    private static Ingredient Active(string id, string name, DateTime updatedAt) => new()
    {
        Id = id,
        Name = name,
        Unit = "kg",
        Quantity = 4m,
        LowStockThreshold = 1m,
        IsActive = true,
        UpdatedAt = updatedAt
    };

    private static Ingredient ExpiredActive(string id) => new()
    {
        Id = id,
        Name = "Expired Cream",
        Unit = "L",
        Quantity = 2m,
        LowStockThreshold = 1m,
        ExpirationDate = DateTime.UtcNow.AddDays(-3),
        IsActive = true,
        UpdatedAt = DateTime.UtcNow.AddDays(-1)
    };

    private static Ingredient AlreadyInactive(string id) => new()
    {
        Id = id,
        Name = "Old Sugar",
        Unit = "kg",
        Quantity = 9m,
        LowStockThreshold = 1m,
        IsActive = false,
        UpdatedAt = DateTime.UtcNow.AddDays(-9)
    };

    [Fact]
    public async Task RepositoryBulkDelete_SoftDeletesOnlyActiveRequested_AndReturnsHonestCount()
    {
        // Arrange: A active, B expired-but-active, C already inactive, D unrelated, E active.
        await using var context = NewContext();
        var seedTime = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var a = Active("A", "Flour", seedTime);
        var b = ExpiredActive("B");
        var c = AlreadyInactive("C");
        var d = Active("D", "Unrelated Rice", seedTime);
        var e = Active("E", "Coffee", seedTime);
        context.Ingredients.AddRange(a, b, c, d, e);
        await context.SaveChangesAsync();
        var repository = new IngredientRepository(context);

        // Act
        var deleted = await repository.DeleteBulkAsync(new[] { "A", "B", "C", "missing-id" });

        // Assert: only A and B were converted to inactive.
        Assert.Equal(2, deleted);
        Assert.False((await context.Ingredients.SingleAsync(i => i.Id == "A")).IsActive);
        Assert.False((await context.Ingredients.SingleAsync(i => i.Id == "B")).IsActive);
        Assert.True((await context.Ingredients.SingleAsync(i => i.Id == "A")).UpdatedAt > seedTime);
        // C was already inactive: row must be untouched, including its UpdatedAt.
        var untouchedInactive = await context.Ingredients.SingleAsync(i => i.Id == "C");
        Assert.False(untouchedInactive.IsActive);
        Assert.Equal(c.UpdatedAt, untouchedInactive.UpdatedAt);
        // D and E are unaffected.
        Assert.True((await context.Ingredients.SingleAsync(i => i.Id == "D")).IsActive);
        Assert.True((await context.Ingredients.SingleAsync(i => i.Id == "E")).IsActive);
    }

    [Fact]
    public async Task RepositoryBulkDelete_EmptyRequest_ReturnsZero()
    {
        await using var context = NewContext();
        context.Ingredients.Add(Active("A", "Flour", DateTime.UtcNow));
        await context.SaveChangesAsync();
        var repository = new IngredientRepository(context);

        var deleted = await repository.DeleteBulkAsync(Array.Empty<string>());

        Assert.Equal(0, deleted);
        Assert.True((await context.Ingredients.SingleAsync(i => i.Id == "A")).IsActive);
    }

    [Fact]
    public async Task ServiceBulkDelete_DelegatesAndReturnsCount()
    {
        var repository = new Mock<IIngredientRepository>(MockBehavior.Strict);
        repository.Setup(r => r.DeleteBulkAsync(new[] { "A", "B" })).ReturnsAsync(2);
        var service = new IngredientService(
            repository.Object,
            Mock.Of<IStockMovementService>(),
            Mock.Of<IIngredientLotService>());

        var deleted = await service.DeleteIngredientsBulkAsync(new[] { "A", "B" });

        Assert.Equal(2, deleted);
    }

    [Fact]
    public async Task ControllerBulkDelete_RejectsEmptyListAndPassesExactIds()
    {
        var service = new Mock<IIngredientService>(MockBehavior.Strict);
        service.Setup(s => s.DeleteIngredientsBulkAsync(new[] { "A", "B" })).ReturnsAsync(2);
        var controller = new IngredientsController(service.Object, Mock.Of<IIngredientLotService>(), Mock.Of<IExportService>(), Mock.Of<IImportService>());

        var empty = await controller.DeleteIngredientsBulk(new BulkDeleteDto());
        Assert.IsType<BadRequestObjectResult>(empty);
        service.Verify(s => s.DeleteIngredientsBulkAsync(It.IsAny<IEnumerable<string>>()), Times.Never);

        var ok = Assert.IsType<OkObjectResult>(await controller.DeleteIngredientsBulk(new BulkDeleteDto { Ids = { "A", "B" } }));
        Assert.Equal(2, ((ok.Value as dynamic)!).deleted);
        service.Verify(s => s.DeleteIngredientsBulkAsync(new[] { "A", "B" }), Times.Once);
        service.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ControllerBulkDelete_MirrorsSingleDeleteAuthorizationScope()
    {
        // The single delete and the bulk delete must run on the same controller-level
        // authorization (Owner,Admin): the bulk route must not be more permissive.
        var single = typeof(IngredientsController).GetMethod(nameof(IngredientsController.DeleteIngredient))!;
        var bulk = typeof(IngredientsController).GetMethod(nameof(IngredientsController.DeleteIngredientsBulk))!;
        var classAuth = Attribute.GetCustomAttribute(typeof(IngredientsController), typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute)) as Microsoft.AspNetCore.Authorization.AuthorizeAttribute;

        Assert.NotNull(classAuth);
        Assert.Equal("Owner,Admin", classAuth!.Roles);
        Assert.DoesNotContain(single.GetCustomAttributes(true), a => a is Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute);
        Assert.DoesNotContain(bulk.GetCustomAttributes(true), a => a is Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute);
        await Task.CompletedTask;
    }
}
