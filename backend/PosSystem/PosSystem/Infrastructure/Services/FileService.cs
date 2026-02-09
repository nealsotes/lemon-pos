using PosSystem.Core.Interfaces;
using System.Text.RegularExpressions;

namespace PosSystem.Infrastructure.Services;

public class FileService : IFileService
{
    private readonly string _uploadPath;
    private readonly string _baseUrl;

    public FileService(IConfiguration configuration, IWebHostEnvironment environment)
    {
        // Use wwwroot from WebHostEnvironment for uploads
        var wwwrootPath = environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        _uploadPath = Path.Combine(wwwrootPath, "uploads");
        
        // Determine base URL - use Railway domain in production, or config value, or localhost
        _baseUrl = GetBaseUrl(configuration, environment);
        
        // Ensure upload directory exists
        if (!Directory.Exists(_uploadPath))
        {
            Directory.CreateDirectory(_uploadPath);
        }
    }
    
    private string GetBaseUrl(IConfiguration configuration, IWebHostEnvironment environment)
    {
        // In production on Railway, use the Railway domain
        if (environment.IsProduction())
        {
            // Try Railway environment variable first
            var railwayDomain = Environment.GetEnvironmentVariable("RAILWAY_PUBLIC_DOMAIN");
            if (!string.IsNullOrEmpty(railwayDomain))
            {
                return railwayDomain.StartsWith("http") ? railwayDomain : $"https://{railwayDomain}";
            }
            
            // Try to get from request context (if available)
            // Otherwise, use the configured BaseUrl or construct from known Railway domain
            var configBaseUrl = configuration["BaseUrl"];
            if (!string.IsNullOrEmpty(configBaseUrl) && !configBaseUrl.Contains("localhost") && !configBaseUrl.Contains("192.168"))
            {
                return configBaseUrl;
            }
            
            // Default Railway domain (can be overridden via env var)
            return "https://quickserve-production.up.railway.app";
        }
        
        // Development - use config or localhost
        return configuration["BaseUrl"] ?? "http://localhost:5001";
    }

    public async Task<string> SaveImageAsync(byte[] imageData, string fileName)
    {
        // Generate unique filename
        var extension = Path.GetExtension(fileName);
        var uniqueFileName = $"{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(_uploadPath, uniqueFileName);

        // Save file
        await File.WriteAllBytesAsync(filePath, imageData);

        // Return relative path
        return $"uploads/{uniqueFileName}";
    }

    public Task<bool> DeleteImageAsync(string imagePath)
    {
        if (string.IsNullOrEmpty(imagePath) || imagePath.StartsWith("data:"))
            return Task.FromResult(true);

        var fullPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", imagePath);
        
        if (File.Exists(fullPath))
        {
            try
            {
                File.Delete(fullPath);
                return Task.FromResult(true);
            }
            catch
            {
                return Task.FromResult(false);
            }
        }
        
        return Task.FromResult(true);
    }

    public string GetImageUrl(string imagePath)
    {
        if (string.IsNullOrEmpty(imagePath))
            return string.Empty;

        // If it's a data URL, return as is
        if (imagePath.StartsWith("data:"))
            return imagePath;

        // If it's a full URL pointing to localhost or old server, convert to relative
        if (imagePath.StartsWith("http://localhost") || imagePath.StartsWith("http://192.168"))
        {
            // Extract the path part (e.g., /uploads/image.jpg)
            var uri = new Uri(imagePath);
            return uri.AbsolutePath;
        }

        // If it's already a full URL (and not localhost), return as is
        if (imagePath.StartsWith("http"))
            return imagePath;

        // For relative paths, return relative URL (works for same-domain deployment on Railway)
        // This ensures images work when frontend and backend are on the same domain
        if (imagePath.StartsWith("/"))
            return imagePath;
        
        return $"/{imagePath}";
    }
} 