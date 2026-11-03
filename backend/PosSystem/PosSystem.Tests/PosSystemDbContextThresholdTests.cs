using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;
using Xunit;

namespace PosSystem.Tests;

// D1: EF treats a numeric property's CLR default (0) as the "unset" sentinel — with
// a database default configured, a deliberate 0 was silently stored as that default
// (a threshold-0 product imported or created stored a threshold of 10, because the
// column was omitted from the INSERT). The model no longer carries a database
// default on the inventory quantity/threshold columns; these tests pin both sides:
// no numeric defaults in the model, and a stored 0 survives a round trip.
public class PosSystemDbContextThresholdTests
{
    [Fact]
    public void Product_LowQuantityThresholdZero_PersistsAsZeroNotDatabaseDefault()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();

        var options = new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseSqlite(connection)
            .Options;

        using (var context = new PosSystemDbContext(options))
        {
            context.Database.EnsureCreated();
            context.Products.Add(new Product
            {
                Id = "p-threshold-zero",
                Name = "Coffee",
                Category = "Drinks",
                Price = 45m,
                Stock = 100,
                LowQuantityThreshold = 0
            });
            context.SaveChanges();
            context.ChangeTracker.Clear();
        }

        using (var context = new PosSystemDbContext(options))
        {
            var stored = context.Products.Single(p => p.Id == "p-threshold-zero");
            Assert.Equal(0, stored.LowQuantityThreshold);
        }
    }

    // No numeric database default may return on the inventory entities' quantity /
    // threshold / stock columns: any HasDefaultValue there re-arms the D1 sentinel
    // footgun (CLR 0 omitted from the INSERT, database default silently wins).
    // Probe semantics: relational GetDefaultValue() reads back the CLR default (0)
    // for unconfigured non-nullable numerics (verified on the SQLite model), so the
    // discriminator is a configured default that DIFFERS from the CLR default —
    // exactly the configuration that loses data.
    // Deliberately out of scope: the owned AddOn line-item Quantity (`HasDefaultValue(1)`
    // — a quantity of 0 is never valid for a cart add-on, so that default is a business
    // minimum, not a lost-value sentinel) and the Product bool/text toggles
    // (HasHotCold/HasAddOns/AddOnsJson — their sentinels map to the same value).
    [Fact]
    public void Model_NoNumericDatabaseDefault_OnInventoryQuantityOrThresholdColumns()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        var options = new DbContextOptionsBuilder<PosSystemDbContext>()
            .UseSqlite(connection)
            .Options;
        using var context = new PosSystemDbContext(options);

        static bool IsNumeric(Type type) =>
            type == typeof(int) || type == typeof(long) || type == typeof(short) || type == typeof(sbyte)
            || type == typeof(uint) || type == typeof(ulong) || type == typeof(ushort) || type == typeof(byte)
            || type == typeof(decimal) || type == typeof(double) || type == typeof(float);

        static bool IsQuantityOrThresholdColumn(string name) =>
            name.Contains("Quantity", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Threshold", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Stock", StringComparison.OrdinalIgnoreCase);

        var coercingDefaultColumns = context.Model.GetEntityTypes()
            .Where(e => e.ClrType == typeof(Product) || e.ClrType == typeof(Ingredient))
            .SelectMany(e => e.GetProperties())
            .Where(p => IsNumeric(p.ClrType)
                        && IsQuantityOrThresholdColumn(p.Name)
                        && !Equals(p.GetDefaultValue(), Activator.CreateInstance(p.ClrType)))
            .Select(p => $"{p.DeclaringEntityType.ClrType.Name}.{p.Name}")
            .ToList();

        Assert.Empty(coercingDefaultColumns);
    }
}