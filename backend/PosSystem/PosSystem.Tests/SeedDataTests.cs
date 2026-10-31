using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// RC-02: default-user seeding semantics — the Program.cs gate is opt-in (default
/// OFF) and, while it stays on, a per-username marker makes deleted default accounts
/// stick. Databases seeded before this change are marked without touching their
/// credentials.
/// </summary>
public class SeedDataTests
{
    private static PosSystemDbContext NewContext()
    {
        return new PosSystemDbContext(new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static long CountMarker(PosSystemDbContext context, string username)
    {
        return context.ApplicationSettings.Local
            .Count(s => s.Key == SeedData.SeededMarkerKey(username));
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("false", false)]
    [InlineData("true", true)]
    [InlineData("True", true)]
    public void ShouldSeedDefaultUsers_IsOptIn(string? configured, bool expected)
    {
        var data = new Dictionary<string, string?>();
        if (configured != null)
        {
            data["Seed:DefaultUsers"] = configured;
        }

        var configuration = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection(data)
            .Build();

        // Absent/false must leave default-user seeding OFF: production databases never
        // regenerate the well-known owner/admin/employee starter accounts.
        Assert.Equal(expected, SeedData.ShouldSeedDefaultUsers(configuration));
    }

    [Fact]
    public async Task InitializeUsersAsync_EmptyDatabase_SeedsThreeDefaultsWithSaltedHashes()
    {
        using var context = NewContext();

        await SeedData.InitializeUsersAsync(context);
        await SeedData.InitializeUsersAsync(context); // second boot: idempotent

        var users = await context.Users.ToListAsync();
        Assert.Equal(3, users.Count);
        Assert.All(users, u => Assert.StartsWith(AuthService.HashFormatPrefix, u.PasswordHash));
        Assert.Equal(3, context.ApplicationSettings.Local.Count(s => s.Key.StartsWith("seed:defaultuser:")));
    }

    [Fact]
    public async Task InitializeUsersAsync_DeletedDefaultAccount_StaysDeletedOnNextBoot()
    {
        using var context = NewContext();

        await SeedData.InitializeUsersAsync(context);
        var owner = await context.Users.SingleAsync(u => u.Username == "owner");
        context.Users.Remove(owner);
        await context.SaveChangesAsync();

        await SeedData.InitializeUsersAsync(context);

        Assert.DoesNotContain(await context.Users.ToListAsync(), u => u.Username == "owner");
    }

    [Fact]
    public async Task InitializeUsersAsync_PreExistingAccountsWithoutMarkers_AreMarkedNotOverwritten()
    {
        // A database seeded before the RC-02 gate existed: accounts present but no
        // markers. The seeding run must record markers WITHOUT touching credentials.
        using var context = NewContext();
        var legacyHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("admin123")));
        context.Users.Add(new User
        {
            Id = "u-pre",
            Username = "owner",
            PasswordHash = legacyHash,
            Role = UserRole.Owner,
            IsActive = true
        });
        await context.SaveChangesAsync();

        await SeedData.InitializeUsersAsync(context);

        // The pre-existing owner keeps its legacy credentials untouched (no overwrite);
        // only the two still-missing defaults are seeded, and owner's marker exists.
        var ownerAfter = await context.Users.SingleAsync(u => u.Username == "owner");
        Assert.Equal(legacyHash, ownerAfter.PasswordHash);
        Assert.Equal(3, (await context.Users.ToListAsync()).Count);
        Assert.Equal(1, CountMarker(context, "owner"));

        // ... and after the operator deletes that account, it stays deleted.
        var owner = await context.Users.SingleAsync(u => u.Username == "owner");
        context.Users.Remove(owner);
        await context.SaveChangesAsync();
        await SeedData.InitializeUsersAsync(context);
        Assert.DoesNotContain(await context.Users.ToListAsync(), u => u.Username == "owner");
        Assert.Equal(2, (await context.Users.ToListAsync()).Count);
    }
}