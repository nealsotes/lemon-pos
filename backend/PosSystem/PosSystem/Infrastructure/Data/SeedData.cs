using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Infrastructure.Data;

public static class SeedData
{
    public static async Task InitializeAsync(PosSystemDbContext context)
    {
        // Check if we have real products (not just category placeholders)
        // Category placeholders have IDs like "cat_0", "cat_1", etc.
        var hasRealProducts = await context.Products
            .AnyAsync(p => !p.Id.StartsWith("cat_"));
        
        if (hasRealProducts)
            return;
        
        // Remove category placeholders if they exist
        var categoryPlaceholders = await context.Products
            .Where(p => p.Id.StartsWith("cat_"))
            .ToListAsync();
        
        if (categoryPlaceholders.Any())
        {
            context.Products.RemoveRange(categoryPlaceholders);
            await context.SaveChangesAsync();
        }

        var products = new List<Product>
        {
            // Beverages
            new() { Id = "1", Name = "Espresso", Price = 2.50m, Category = "Beverages", Stock = 45, Image = "☕" },
            new() { Id = "2", Name = "Cappuccino", Price = 3.75m, Category = "Beverages", Stock = 38, Image = "☕" },
            new() { Id = "3", Name = "Latte", Price = 4.25m, Category = "Beverages", Stock = 42, Image = "☕" },
            new() { Id = "4", Name = "Americano", Price = 3.00m, Category = "Beverages", Stock = 35, Image = "☕" },
            new() { Id = "5", Name = "Green Tea", Price = 2.75m, Category = "Beverages", Stock = 28, Image = "🍵" },
            new() { Id = "6", Name = "Black Tea", Price = 2.50m, Category = "Beverages", Stock = 32, Image = "🍵" },
            new() { Id = "7", Name = "Orange Juice", Price = 4.25m, Category = "Beverages", Stock = 25, Image = "🧃" },
            new() { Id = "8", Name = "Apple Juice", Price = 3.99m, Category = "Beverages", Stock = 22, Image = "🧃" },
            new() { Id = "9", Name = "Bottled Water", Price = 1.50m, Category = "Beverages", Stock = 100, Image = "💧" },
            new() { Id = "10", Name = "Sparkling Water", Price = 2.25m, Category = "Beverages", Stock = 45, Image = "💧" },
            new() { Id = "11", Name = "Hot Chocolate", Price = 4.50m, Category = "Beverages", Stock = 18, Image = "☕" },
            new() { Id = "12", Name = "Smoothie", Price = 5.99m, Category = "Beverages", Stock = 15, Image = "🧃" },
            
            // Food - Breakfast
            new() { Id = "13", Name = "Croissant", Price = 4.50m, Category = "Food", Stock = 30, Image = "🥐" },
            new() { Id = "14", Name = "Chocolate Croissant", Price = 5.25m, Category = "Food", Stock = 25, Image = "🥐" },
            new() { Id = "15", Name = "Blueberry Muffin", Price = 3.25m, Category = "Food", Stock = 20, Image = "🧁" },
            new() { Id = "16", Name = "Chocolate Muffin", Price = 3.50m, Category = "Food", Stock = 18, Image = "🧁" },
            new() { Id = "17", Name = "Bagel", Price = 3.75m, Category = "Food", Stock = 22, Image = "🥯" },
            new() { Id = "18", Name = "Toast", Price = 2.99m, Category = "Food", Stock = 35, Image = "🍞" },
            
            // Food - Sandwiches & Wraps
            new() { Id = "19", Name = "Chicken Sandwich", Price = 8.99m, Category = "Food", Stock = 25, Image = "🥪" },
            new() { Id = "20", Name = "Turkey Sandwich", Price = 7.99m, Category = "Food", Stock = 20, Image = "🥪" },
            new() { Id = "21", Name = "Veggie Wrap", Price = 6.99m, Category = "Food", Stock = 15, Image = "🌯" },
            new() { Id = "22", Name = "Ham & Cheese", Price = 7.50m, Category = "Food", Stock = 18, Image = "🥪" },
            new() { Id = "23", Name = "Tuna Sandwich", Price = 6.75m, Category = "Food", Stock = 12, Image = "🥪" },
            
            // Food - Salads & Bowls
            new() { Id = "24", Name = "Caesar Salad", Price = 9.99m, Category = "Food", Stock = 15, Image = "🥗" },
            new() { Id = "25", Name = "Greek Salad", Price = 8.99m, Category = "Food", Stock = 12, Image = "🥗" },
            new() { Id = "26", Name = "Garden Salad", Price = 7.99m, Category = "Food", Stock = 18, Image = "🥗" },
            new() { Id = "27", Name = "Buddha Bowl", Price = 11.99m, Category = "Food", Stock = 10, Image = "🥗" },
            
            // Food - Snacks & Treats
            new() { Id = "28", Name = "Chocolate Chip Cookie", Price = 2.50m, Category = "Food", Stock = 40, Image = "🍪" },
            new() { Id = "29", Name = "Brownie", Price = 3.75m, Category = "Food", Stock = 25, Image = "🍫" },
            new() { Id = "30", Name = "Cheesecake Slice", Price = 5.99m, Category = "Food", Stock = 12, Image = "🍰" },
            new() { Id = "31", Name = "Tiramisu", Price = 6.50m, Category = "Food", Stock = 8, Image = "🍰" },
            new() { Id = "32", Name = "Popcorn", Price = 3.25m, Category = "Food", Stock = 30, Image = "🍿" },
            new() { Id = "33", Name = "Mixed Nuts", Price = 4.99m, Category = "Food", Stock = 20, Image = "🥜" },
            
            // Food - Hot Items
            new() { Id = "34", Name = "Soup of the Day", Price = 6.99m, Category = "Food", Stock = 15, Image = "🍲" },
            new() { Id = "35", Name = "Pasta Salad", Price = 7.50m, Category = "Food", Stock = 12, Image = "🍝" },
            new() { Id = "36", Name = "Quiche Slice", Price = 8.25m, Category = "Food", Stock = 10, Image = "🥧" },
            
            // Merchandise
            new() { Id = "37", Name = "Coffee Mug", Price = 12.99m, Category = "Merchandise", Stock = 15, Image = "☕" },
            new() { Id = "38", Name = "T-Shirt", Price = 19.99m, Category = "Merchandise", Stock = 20, Image = "👕" },
            new() { Id = "39", Name = "Coffee Beans (1lb)", Price = 14.99m, Category = "Merchandise", Stock = 25, Image = "🫘" },
            new() { Id = "40", Name = "Gift Card", Price = 25.00m, Category = "Merchandise", Stock = 50, Image = "💳" }
        };

        await context.Products.AddRangeAsync(products);
        await context.SaveChangesAsync();
    }
    
    // New method to seed only categories
    public static async Task InitializeCategoriesOnlyAsync(PosSystemDbContext context)
    {
        // Check if there are already products with categories
        if (await context.Products.AnyAsync())
            return;
            
        // Define the categories we want to seed
        var categories = new[] { "Beverages", "Food", "Merchandise" };
        
        // Create one minimal product for each category just to have the category in the database
        var categoryProducts = categories.Select((category, index) => new Product
        {
            Id = $"cat_{index}",
            Name = $"{category} (Category)",
            Price = 0.01m,  // Minimal price
            Category = category,
            Stock = 0,      // Zero stock
            Image = "📋",   // Category icon
            IsActive = true
        }).ToList();
        
        await context.Products.AddRangeAsync(categoryProducts);
        await context.SaveChangesAsync();
    }

    public static async Task InitializeUsersAsync(PosSystemDbContext context)
    {
        var usersToAdd = new List<User>();

        // Check and create owner user if it doesn't exist
        if (!await context.Users.AnyAsync(u => u.Username == "owner"))
        {
            usersToAdd.Add(new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = "owner",
                PasswordHash = AuthService.HashPassword("admin123"),
                Role = UserRole.Owner,
                CreatedAt = DateTime.UtcNow,
                IsActive = true
            });
        }

        // Check and create employee user if it doesn't exist
        if (!await context.Users.AnyAsync(u => u.Username == "employee"))
        {
            usersToAdd.Add(new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = "employee",
                PasswordHash = AuthService.HashPassword("emp123"),
                Role = UserRole.Employee,
                CreatedAt = DateTime.UtcNow,
                IsActive = true
            });
        }

        // Check and create admin user if it doesn't exist
        if (!await context.Users.AnyAsync(u => u.Username == "admin"))
        {
            usersToAdd.Add(new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = "admin",
                PasswordHash = AuthService.HashPassword("admin123"),
                Role = UserRole.Admin,
                CreatedAt = DateTime.UtcNow,
                IsActive = true
            });
        }

        // Add any missing users
        if (usersToAdd.Any())
        {
            await context.Users.AddRangeAsync(usersToAdd);
            await context.SaveChangesAsync();
        }
    }
}