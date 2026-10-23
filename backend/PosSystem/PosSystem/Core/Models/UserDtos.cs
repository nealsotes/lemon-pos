namespace PosSystem.Core.Models;

/// <summary>
/// DTO returned by the users API — never exposes PasswordHash.
/// </summary>
public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public bool IsActive { get; set; }
}

public class CreateUserRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

public class UpdatePasswordRequest
{
    public string Password { get; set; } = string.Empty;
}

public class UpdateUserStatusRequest
{
    public bool IsActive { get; set; }
}