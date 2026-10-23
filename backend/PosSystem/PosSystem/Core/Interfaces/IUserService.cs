using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IUserService
{
    Task<List<UserDto>> GetAllUsersAsync(string? viewerRole = null);
    Task<UserDto> CreateUserAsync(CreateUserRequest request, string? creatorRole = null);
    Task SetPasswordAsync(string userId, string password);
    Task SetActiveStatusAsync(string userId, bool isActive, string? currentUsername = null);
}