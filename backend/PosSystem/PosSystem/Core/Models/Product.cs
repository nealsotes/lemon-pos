using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PosSystem.Core.Models;

public class Product
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal? HotPrice { get; set; }
    public decimal? ColdPrice { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Stock { get; set; }
    public int LowQuantityThreshold { get; set; } = 10;
    public string Image { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
    public bool HasHotCold { get; set; } = false;
    public bool HasAddOns { get; set; } = false;

    [JsonIgnore]
    public string AddOnsJson { get; set; } = "[]";

    [NotMapped]
    public List<AddOnDto>? AddOns
    {
        get
        {
            if (string.IsNullOrEmpty(AddOnsJson) || AddOnsJson == "[]")
                return new List<AddOnDto>();
            try
            {
                return JsonSerializer.Deserialize<List<AddOnDto>>(AddOnsJson);
            }
            catch
            {
                return new List<AddOnDto>();
            }
        }
        set
        {
            AddOnsJson = value != null ? JsonSerializer.Serialize(value) : "[]";
        }
    }
}
