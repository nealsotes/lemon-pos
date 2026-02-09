using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IProductRepository
{
    Task<IEnumerable<Product>> GetAllAsync();
    Task<IEnumerable<Product>> GetPaginatedAsync(int page, int pageSize);
    Task<Product?> GetByIdAsync(string id);
    Task<Product> AddAsync(Product product);
    Task<Product> UpdateAsync(Product product);
    Task DeleteAsync(string id);
    Task<IEnumerable<string>> GetCategoriesAsync();
    Task<IEnumerable<Product>> GetByCategoryAsync(string category);
} 