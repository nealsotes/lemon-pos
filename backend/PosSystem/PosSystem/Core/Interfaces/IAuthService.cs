using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IAuthService
{
    Task<LoginResult?> LoginAsync(string username, string password, bool rememberMe = false);
    Task<bool> ValidateTokenAsync(string token);
    Task<User?> GetUserFromTokenAsync(string token);
}

public class LoginResult
{
    public string Token { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public DateTime ExpiresAt { get; set; }
}

