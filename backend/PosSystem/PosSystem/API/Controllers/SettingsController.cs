using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Data;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly PosSystemDbContext _context;

    public SettingsController(PosSystemDbContext context)
    {
        _context = context;
    }

    [HttpGet("pages")]
    [AllowAnonymous] // Allow all users to read settings
    public async Task<ActionResult<IEnumerable<PageSettingDto>>> GetPageSettings()
    {
        var settingsJson = await _context.ApplicationSettings
            .FirstOrDefaultAsync(s => s.Key == "pageSettings");
        
        if (settingsJson == null)
        {
            // Return defaults
            return Ok(GetDefaultPageSettings());
        }

        try
        {
            var options = new System.Text.Json.JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };
            var settings = System.Text.Json.JsonSerializer.Deserialize<List<PageSettingDto>>(settingsJson.Value, options);
            return Ok(settings ?? GetDefaultPageSettings());
        }
        catch
        {
            return Ok(GetDefaultPageSettings());
        }
    }

    [HttpPost("pages")]
    [Authorize(Roles = "Admin")] // Only Admin can modify settings
    public async Task<ActionResult> SavePageSettings([FromBody] List<PageSettingDto> settings)
    {
        try
        {
            if (settings == null || settings.Count == 0)
            {
                return BadRequest(new { message = "Settings data is required" });
            }

            var username = User.Identity?.Name ?? "unknown";
            var serializerOptions = new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            };
            var settingsJson = System.Text.Json.JsonSerializer.Serialize(settings, serializerOptions);
            
            var existing = await _context.ApplicationSettings
                .FirstOrDefaultAsync(s => s.Key == "pageSettings");
            
            if (existing != null)
            {
                existing.Value = settingsJson;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = username;
                _context.ApplicationSettings.Update(existing);
            }
            else
            {
                var newSetting = new ApplicationSettings
                {
                    Id = Guid.NewGuid().ToString(),
                    Key = "pageSettings",
                    Value = settingsJson,
                    UpdatedAt = DateTime.UtcNow,
                    UpdatedBy = username
                };
                _context.ApplicationSettings.Add(newSetting);
            }

            var savedCount = await _context.SaveChangesAsync();
            
            if (savedCount > 0)
            {
                return Ok(new { message = "Settings saved successfully", saved = true });
            }
            else
            {
                return StatusCode(500, new { message = "Failed to save settings - no changes were persisted" });
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Error saving settings: {ex.Message}", error = ex.ToString() });
        }
    }

    [HttpPost("pages/reset")]
    [Authorize(Roles = "Admin")] // Only Admin can reset settings
    public async Task<ActionResult> ResetPageSettings()
    {
        try
        {
            var defaults = GetDefaultPageSettings();
            var serializerOptions = new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
            };
            var settingsJson = System.Text.Json.JsonSerializer.Serialize(defaults, serializerOptions);
            var username = User.Identity?.Name ?? "unknown";
            
            var existing = await _context.ApplicationSettings
                .FirstOrDefaultAsync(s => s.Key == "pageSettings");
            
            if (existing != null)
            {
                existing.Value = settingsJson;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = username;
                _context.ApplicationSettings.Update(existing);
            }
            else
            {
                var newSetting = new ApplicationSettings
                {
                    Id = Guid.NewGuid().ToString(),
                    Key = "pageSettings",
                    Value = settingsJson,
                    UpdatedAt = DateTime.UtcNow,
                    UpdatedBy = username
                };
                _context.ApplicationSettings.Add(newSetting);
            }

            var savedCount = await _context.SaveChangesAsync();
            
            if (savedCount > 0)
            {
                return Ok(defaults);
            }
            else
            {
                return StatusCode(500, new { message = "Failed to reset settings - no changes were persisted" });
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Error resetting settings: {ex.Message}", error = ex.ToString() });
        }
    }

    private List<PageSettingDto> GetDefaultPageSettings()
    {
        return new List<PageSettingDto>
        {
            new() { Path = "/pos", Name = "POS", Enabled = true, RequiresOwner = false },
            new() { Path = "/cart", Name = "Cart", Enabled = true, RequiresOwner = false },
            new() { Path = "/reports", Name = "Reports", Enabled = true, RequiresOwner = true },
            new() { Path = "/products", Name = "Products", Enabled = true, RequiresOwner = true },
            new() { Path = "/inventory", Name = "Inventory", Enabled = true, RequiresOwner = true },
            new() { Path = "/printer-settings", Name = "Printer Settings", Enabled = true, RequiresOwner = true },
            new() { Path = "/checkout", Name = "Checkout", Enabled = true, RequiresOwner = false },
            new() { Path = "/receipt", Name = "Receipt", Enabled = true, RequiresOwner = false }
        };
    }
}

public class PageSettingDto
{
    [System.Text.Json.Serialization.JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;
    
    [System.Text.Json.Serialization.JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
    
    [System.Text.Json.Serialization.JsonPropertyName("enabled")]
    public bool Enabled { get; set; }
    
    [System.Text.Json.Serialization.JsonPropertyName("requiresOwner")]
    public bool RequiresOwner { get; set; }
}
