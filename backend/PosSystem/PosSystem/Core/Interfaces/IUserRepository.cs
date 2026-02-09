using PosSystem.Core.Models;

namespace PosSystem.Core.Interfaces;

public interface IUserRepository
{
    Task<User?> GetByUsernameAsync(string username);
    Task<User?> GetByIdAsync(string id);
    Task<User> CreateAsync(User user);
    Task<User> UpdateAsync(User user);
}

