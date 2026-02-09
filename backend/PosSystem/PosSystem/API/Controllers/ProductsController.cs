using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using System.Text.RegularExpressions;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Employee,Admin")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly IFileService _fileService;

    public ProductsController(IProductService productService, IFileService fileService)
    {
        _productService = productService;
        _fileService = fileService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Product>>> GetProducts([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var products = await _productService.GetProductsPaginatedAsync(page, pageSize);
        // Fix image URLs for Railway deployment
        foreach (var product in products)
        {
            product.Image = FixImageUrl(product.Image);
        }
        return Ok(products);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Product>> GetProduct(string id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        if (product == null)
        {
            return NotFound();
        }
        // Fix image URL for Railway deployment
        product.Image = FixImageUrl(product.Image);
        return Ok(product);
    }
    
    private string FixImageUrl(string imageUrl)
    {
        if (string.IsNullOrEmpty(imageUrl))
            return string.Empty;

        // If it's a data URL, return as is
        if (imageUrl.StartsWith("data:"))
            return imageUrl;

        // If it's a full URL pointing to localhost or old server, convert to relative
        if (imageUrl.StartsWith("http://localhost") || imageUrl.StartsWith("http://192.168") || imageUrl.StartsWith("https://localhost"))
        {
            try
            {
                var uri = new Uri(imageUrl);
                return uri.AbsolutePath; // Returns /uploads/image.jpg
            }
            catch
            {
                // If URI parsing fails, try to extract path manually
                var pathMatch = System.Text.RegularExpressions.Regex.Match(imageUrl, @"/(uploads/.*)$");
                if (pathMatch.Success)
                {
                    return pathMatch.Groups[1].Value;
                }
                return imageUrl;
            }
        }

        // If it's already a relative path or full URL (not localhost), return as is
        return imageUrl;
    }

    [HttpPost]
    [Authorize(Roles = "Owner,Admin")]
    public async Task<ActionResult<Product>> CreateProduct(ProductDto productDto)
    {
        try
        {
            var product = new Product
            {
                Name = productDto.Name,
                Price = productDto.Price,
                HotPrice = productDto.HotPrice,
                ColdPrice = productDto.ColdPrice,
                Category = productDto.Category,
                Stock = productDto.Stock,
                LowQuantityThreshold = productDto.LowQuantityThreshold,
                IsActive = productDto.IsActive
            };

                         // Handle image processing
             if (!string.IsNullOrEmpty(productDto.Image))
             {
                 if (productDto.Image.StartsWith("data:image/"))
                 {
                     // Convert base64 data URL to file
                     var imageData = ConvertBase64ToBytes(productDto.Image);
                     
                     // Validate file size (max 5MB after compression)
                     if (imageData.Length > 5 * 1024 * 1024)
                     {
                         return BadRequest("Image file is too large. Please use a smaller image or compress it.");
                     }
                     
                    var fileName = $"product_{Guid.NewGuid()}.jpg";
                    var imagePath = await _fileService.SaveImageAsync(imageData, fileName);
                    // Use relative path for Railway (same-domain deployment)
                    product.Image = $"/{imagePath}";
                 }
                 else
                 {
                     // Emoji or existing URL
                     product.Image = productDto.Image;
                 }
             }

            var createdProduct = await _productService.CreateProductAsync(product);
            // Fix image URL for Railway deployment
            createdProduct.Image = FixImageUrl(createdProduct.Image);
            return CreatedAtAction(nameof(GetProduct), new { id = createdProduct.Id }, createdProduct);
        }
        catch (Exception ex)
        {
            return BadRequest($"Error creating product: {ex.Message}");
        }
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Owner,Admin")]
    public async Task<IActionResult> UpdateProduct(string id, ProductDto productDto)
    {
        try
        {
            var existingProduct = await _productService.GetProductByIdAsync(id);
            if (existingProduct == null)
            {
                return NotFound($"Product with ID {id} not found");
            }

            // Handle image processing
            string newImagePath = existingProduct.Image;
            if (!string.IsNullOrEmpty(productDto.Image))
            {
                if (productDto.Image.StartsWith("data:image/"))
                {
                    // Convert base64 data URL to file
                    var imageData = ConvertBase64ToBytes(productDto.Image);
                    var fileName = $"product_{Guid.NewGuid()}.jpg";
                    var imagePath = await _fileService.SaveImageAsync(imageData, fileName);
                    // Use relative path for Railway (same-domain deployment)
                    newImagePath = $"/{imagePath}";
                    
                    // Delete old image if it's not an emoji
                    if (!string.IsNullOrEmpty(existingProduct.Image) && 
                        !existingProduct.Image.StartsWith("data:") && 
                        !existingProduct.Image.StartsWith("http"))
                    {
                        await _fileService.DeleteImageAsync(existingProduct.Image);
                    }
                }
                else
                {
                    // Emoji or existing URL
                    newImagePath = productDto.Image;
                }
            }

            var product = new Product
            {
                Id = id,
                Name = productDto.Name,
                Price = productDto.Price,
                HotPrice = productDto.HotPrice,
                ColdPrice = productDto.ColdPrice,
                Category = productDto.Category,
                Stock = productDto.Stock,
                LowQuantityThreshold = productDto.LowQuantityThreshold,
                Image = newImagePath,
                IsActive = productDto.IsActive,
                CreatedAt = existingProduct.CreatedAt,
                UpdatedAt = DateTime.UtcNow
            };

            var updatedProduct = await _productService.UpdateProductAsync(id, product);
            // Fix image URL for Railway deployment
            updatedProduct.Image = FixImageUrl(updatedProduct.Image);
            return Ok(updatedProduct);
        }
        catch (ArgumentException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            return BadRequest($"Error updating product: {ex.Message}");
        }
    }

    private byte[] ConvertBase64ToBytes(string base64String)
    {
        // Remove data URL prefix if present
        var base64Data = base64String;
        if (base64String.Contains(","))
        {
            base64Data = base64String.Split(',')[1];
        }
        
        return Convert.FromBase64String(base64Data);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Owner,Admin")]
    public async Task<IActionResult> DeleteProduct(string id)
    {
        await _productService.DeleteProductAsync(id);
        return NoContent();
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IEnumerable<string>>> GetCategories()
    {
        var categories = await _productService.GetCategoriesAsync();
        return Ok(categories);
    }

    [HttpGet("category/{category}")]
    public async Task<ActionResult<IEnumerable<Product>>> GetProductsByCategory(string category)
    {
        var products = await _productService.GetProductsByCategoryAsync(category);
        // Fix image URLs for Railway deployment
        foreach (var product in products)
        {
            product.Image = FixImageUrl(product.Image);
        }
        return Ok(products);
    }
} 