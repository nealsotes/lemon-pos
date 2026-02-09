using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Data;

public class PosSystemDbContext : DbContext
{
    public PosSystemDbContext(DbContextOptions<PosSystemDbContext> options) : base(options)
    {
    }

    public DbSet<Product> Products { get; set; }
    public DbSet<Transaction> Transactions { get; set; }
    public DbSet<Ingredient> Ingredients { get; set; }
    public DbSet<StockMovement> StockMovements { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<ApplicationSettings> ApplicationSettings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Product configuration
        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Price).HasPrecision(18, 2);
            entity.Property(e => e.HotPrice).HasPrecision(18, 2);
            entity.Property(e => e.ColdPrice).HasPrecision(18, 2);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Category).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Image).HasMaxLength(200);
            entity.Property(e => e.LowQuantityThreshold).IsRequired().HasDefaultValue(10);
        });

        // Transaction configuration
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Total).HasPrecision(18, 2);
            entity.Property(e => e.PaymentMethod).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
            
            entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
            entity.Property(e => e.AmountReceived).HasPrecision(18, 2);
            entity.Property(e => e.Change).HasPrecision(18, 2);
            
            entity.OwnsOne(e => e.CustomerInfo, customer =>
            {
                customer.Property(c => c.Name).HasMaxLength(100);
                customer.Property(c => c.Email).HasMaxLength(100);
                customer.Property(c => c.Phone).HasMaxLength(20);
                customer.Property(c => c.DiscountType).HasMaxLength(20);
                customer.Property(c => c.DiscountId).HasMaxLength(50);
            });

            entity.OwnsMany(e => e.Items, items =>
            {
                // Explicitly map to singular table name to match Railway database
                items.ToTable("TransactionItem");
                items.Property(i => i.ProductId).IsRequired();
                items.Property(i => i.Name).IsRequired().HasMaxLength(100);
                items.Property(i => i.Category).HasMaxLength(100); // Add Category configuration
                items.Property(i => i.Price).HasPrecision(18, 2);
                items.Property(i => i.BasePrice).HasPrecision(18, 2);
                items.Property(i => i.Temperature).IsRequired();
                items.Property(i => i.Quantity).IsRequired();

                items.OwnsOne(i => i.Discount, discount =>
                {
                    discount.Property(d => d.Type).HasMaxLength(50);
                    discount.Property(d => d.Percentage).HasPrecision(18, 2);
                    discount.Property(d => d.Amount).HasPrecision(18, 2);
                });
                
                items.OwnsMany(i => i.AddOns, addons => 
                {
                    // Explicitly map to singular table name to match Railway database
                    addons.ToTable("AddOn");
                    // Configure Id as auto-increment (must be first in composite PK for MySQL)
                    addons.Property<int>("Id").ValueGeneratedOnAdd();
                    addons.HasKey("Id", "TransactionItemTransactionId", "TransactionItemId");
                    addons.Property(a => a.Name).IsRequired().HasMaxLength(100);
                    addons.Property(a => a.Price).HasPrecision(18, 2);
                    addons.Property(a => a.Quantity).IsRequired().HasDefaultValue(1);
                });
            });
            
            entity.Property(e => e.ServiceType).IsRequired();
            entity.Property(e => e.ServiceFee).HasPrecision(18, 2);
        });

        // Ingredient configuration
        modelBuilder.Entity<Ingredient>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Quantity).HasPrecision(18, 2);
            entity.Property(e => e.LowStockThreshold).HasPrecision(18, 2);
            entity.Property(e => e.UnitCost).HasPrecision(18, 2);
            entity.Property(e => e.LastPurchaseCost).HasPrecision(18, 2);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Unit).IsRequired().HasMaxLength(20);
            entity.Property(e => e.Supplier).HasMaxLength(100);
        });

        // StockMovement configuration
        modelBuilder.Entity<StockMovement>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Quantity).HasPrecision(18, 2);
            entity.Property(e => e.UnitCost).HasPrecision(18, 2);
            entity.Property(e => e.IngredientId).IsRequired();
            entity.Property(e => e.MovementType).IsRequired();
            entity.Property(e => e.Reason).HasMaxLength(200);
            entity.Property(e => e.Notes).HasMaxLength(500);
            entity.Property(e => e.CreatedBy).HasMaxLength(100);
            
            // Index for faster queries
            entity.HasIndex(e => e.IngredientId);
            entity.HasIndex(e => e.CreatedAt);
        });

        // User configuration
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Username).IsRequired().HasMaxLength(50);
            entity.Property(e => e.PasswordHash).IsRequired();
            entity.HasIndex(e => e.Username).IsUnique();
        });

        // ApplicationSettings configuration
        modelBuilder.Entity<ApplicationSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Key).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Value).IsRequired();
            entity.Property(e => e.UpdatedBy).HasMaxLength(100);
            entity.HasIndex(e => e.Key).IsUnique();
        });
    }
} 