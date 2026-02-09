using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class ProductService : IProductService
{
    private readonly IProductRepository _productRepository;
    private readonly IInventoryService _inventoryService;

    public ProductService(IProductRepository productRepository, IInventoryService inventoryService)
    {
        _productRepository = productRepository;
        _inventoryService = inventoryService;
    }

    public async Task<IEnumerable<Product>> GetAllProductsAsync()
    {
        return await _productRepository.GetAllAsync();
    }

    public async Task<IEnumerable<Product>> GetProductsPaginatedAsync(int page, int pageSize)
    {
        return await _productRepository.GetPaginatedAsync(page, pageSize);
    }

    public async Task<Product?> GetProductByIdAsync(string id)
    {
        return await _productRepository.GetByIdAsync(id);
    }

    public async Task<Product> CreateProductAsync(Product product)
    {
        if (string.IsNullOrWhiteSpace(product.Id))
        {
            product.Id = Guid.NewGuid().ToString();
        }

        return await _productRepository.AddAsync(product);
    }

    public async Task<Product> UpdateProductAsync(string id, Product product)
    {
        var existingProduct = await _productRepository.GetByIdAsync(id);
        if (existingProduct == null)
        {
            throw new ArgumentException($"Product with ID {id} not found");
        }

        existingProduct.Name = product.Name;
        existingProduct.Price = product.Price;
        existingProduct.HotPrice = product.HotPrice;
        existingProduct.ColdPrice = product.ColdPrice;
        existingProduct.Category = product.Category;
        existingProduct.Stock = product.Stock;
        existingProduct.LowQuantityThreshold = product.LowQuantityThreshold;
        existingProduct.Image = product.Image;
        existingProduct.IsActive = product.IsActive;
        existingProduct.UpdatedAt = DateTime.UtcNow;

        return await _productRepository.UpdateAsync(existingProduct);
    }

    public async Task DeleteProductAsync(string id)
    {
        await _productRepository.DeleteAsync(id);
    }

    public async Task<IEnumerable<string>> GetCategoriesAsync()
    {
        return await _productRepository.GetCategoriesAsync();
    }

    public async Task<IEnumerable<Product>> GetProductsByCategoryAsync(string category)
    {
        return await _productRepository.GetByCategoryAsync(category);
    }

    public async Task UpdateStockAsync(string productId, int quantity)
    {
        await _inventoryService.UpdateStockAsync(productId, quantity);
    }
} 