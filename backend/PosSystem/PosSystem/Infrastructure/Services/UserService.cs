using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class UserService : IUserService
{
    private const int MinUsernameLength = 3;
    private const int MinPasswordLength = 6;

    private readonly IUserRepository _userRepository;

    public UserService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public async Task<List<UserDto>> GetAllUsersAsync(string? viewerRole = null)
    {
        var users = await _userRepository.GetAllAsync();

        // Owners manage staff — admin (manager role) accounts are not part of their view
        if (string.Equals(viewerRole, nameof(UserRole.Owner), StringComparison.OrdinalIgnoreCase))
        {
            users = users.Where(u => u.Role != UserRole.Admin).ToList();
        }

        return users.Select(ToDto).ToList();
    }

    public async Task<UserDto> CreateUserAsync(CreateUserRequest request, string? creatorRole = null)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        ValidateUsername(username);
        ValidatePassword(request.Password);

        if (!TryParseRole(request.Role, out var role))
        {
            throw new ArgumentException($"Invalid role '{request.Role}'. Expected Owner, Employee, or Admin.");
        }

        ValidateCreatorRole(creatorRole, role);

        var existingUsers = await _userRepository.GetAllAsync();
        if (existingUsers.Any(u => u.Username.Equals(username, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"Username '{username}' is already taken.");
        }

        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Username = username,
            PasswordHash = AuthService.HashPassword(request.Password),
            Role = role,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        var created = await _userRepository.CreateAsync(user);
        return ToDto(created);
    }

    public async Task SetPasswordAsync(string userId, string password)
    {
        ValidatePassword(password);

        var user = await _userRepository.GetByIdAsync(userId)
            ?? throw new ArgumentException("User not found");

        user.PasswordHash = AuthService.HashPassword(password);
        await _userRepository.UpdateAsync(user);
    }

    public async Task SetActiveStatusAsync(string userId, bool isActive, string? currentUsername = null)
    {
        var user = await _userRepository.GetByIdAsync(userId)
            ?? throw new ArgumentException("User not found");

        if (!isActive &&
            string.Equals(user.Username, currentUsername, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("You cannot deactivate your own account.");
        }

        user.IsActive = isActive;
        await _userRepository.UpdateAsync(user);
    }

    /// <summary>
    /// A user cannot mint accounts that outrank or sidestep their own role:
    /// Owner can create Owner/Employee, Admin can create Admin/Employee,
    /// but Owner cannot create Admin and Admin cannot create Owner.
    /// </summary>
    private static readonly Dictionary<string, UserRole[]> CreatorAllowedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        [nameof(UserRole.Owner)] = new[] { UserRole.Owner, UserRole.Employee },
        [nameof(UserRole.Admin)] = new[] { UserRole.Admin, UserRole.Employee }
    };

    private static void ValidateCreatorRole(string? creatorRole, UserRole requestedRole)
    {
        if (string.IsNullOrEmpty(creatorRole))
        {
            return;
        }

        if (!CreatorAllowedRoles.TryGetValue(creatorRole, out var allowed))
        {
            throw new InvalidOperationException($"Role '{creatorRole}' cannot create accounts.");
        }

        if (!allowed.Contains(requestedRole))
        {
            throw new InvalidOperationException(
                $"A {creatorRole} account cannot create {requestedRole} accounts.");
        }
    }

    private void ValidateUsername(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ArgumentException("Username is required.");
        }

        if (username.Length < MinUsernameLength)
        {
            throw new ArgumentException($"Username must be at least {MinUsernameLength} characters.");
        }

        if (username.Length > 50)
        {
            throw new ArgumentException("Username must be at most 50 characters.");
        }

        if (!username.All(c => char.IsLetterOrDigit(c) || c is '_' or '.' or '-'))
        {
            throw new ArgumentException("Username may only contain letters, digits, and _ . -");
        }
    }

    private void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Password is required.");
        }

        if (password.Length < MinPasswordLength)
        {
            throw new ArgumentException($"Password must be at least {MinPasswordLength} characters.");
        }

        if (password.Length > 100)
        {
            throw new ArgumentException("Password must be at most 100 characters.");
        }
    }

    private static bool TryParseRole(string? role, out UserRole parsed)
    {
        return Enum.TryParse(role, ignoreCase: true, out parsed)
            && Enum.IsDefined(parsed);
    }

    private static UserDto ToDto(User user)
    {
        return new UserDto
        {
            Id = user.Id,
            Username = user.Username,
            Role = user.Role.ToString(),
            CreatedAt = user.CreatedAt,
            LastLoginAt = user.LastLoginAt,
            IsActive = user.IsActive
        };
    }
}