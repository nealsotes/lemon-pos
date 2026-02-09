using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IProductService
{
    Task<IEnumerable<Product>> GetAllProductsAsync();
    Task<IEnumerable<Product>> GetProductsPaginatedAsync(int page, int pageSize);
    Task<Product?> GetProductByIdAsync(string id);
    Task<Product> CreateProductAsync(Product product);
    Task<Product> UpdateProductAsync(string id, Product product);
    Task DeleteProductAsync(string id);
    Task<IEnumerable<string>> GetCategoriesAsync();
    Task<IEnumerable<Product>> GetProductsByCategoryAsync(string category);
    Task UpdateStockAsync(string productId, int quantity);
} 