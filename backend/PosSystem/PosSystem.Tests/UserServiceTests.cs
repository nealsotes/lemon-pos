using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

public class UserServiceTests
{
    private readonly Mock<IUserRepository> _userRepository = new Mock<IUserRepository>();
    private readonly UserService _service;

    public UserServiceTests()
    {
        _service = new UserService(_userRepository.Object);
    }

    private static CreateUserRequest ValidRequest(
        string username = "manager",
        string password = "secret123",
        string role = "Employee")
    {
        return new CreateUserRequest
        {
            Username = username,
            Password = password,
            Role = role
        };
    }

    [Fact]
    public async Task CreateUserAsync_WithValidRequest_HashesPasswordAndReturnsDto()
    {
        _userRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<User>());
        _userRepository.Setup(r => r.CreateAsync(It.IsAny<User>()))
            .ReturnsAsync((User user) => user);

        var result = await _service.CreateUserAsync(ValidRequest());

        // Arrange-Act-Assert
        Assert.Equal("manager", result.Username);
        Assert.Equal("Employee", result.Role);
        Assert.True(result.IsActive);
        _userRepository.Verify(r => r.CreateAsync(It.Is<User>(u =>
            u.PasswordHash == AuthService.HashPassword("secret123"))), Times.Once);
    }

    [Fact]
    public async Task CreateUserAsync_WithDuplicateUsername_ThrowsInvalidOperationException()
    {
        // Arrange — duplicates are blocked case-insensitively
        _userRepository.Setup(r => r.GetAllAsync())
            .ReturnsAsync(new List<User>
            {
                new User { Id = "1", Username = "owner" }
            });

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.CreateUserAsync(ValidRequest(username: "OWNER")));
    }

    [Fact]
    public async Task CreateUserAsync_WithShortPassword_ThrowsArgumentException()
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateUserAsync(ValidRequest(password: "12345")));
    }

    [Fact]
    public async Task CreateUserAsync_WithInvalidRole_ThrowsArgumentException()
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateUserAsync(ValidRequest(role: "Intern")));
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("")]
    [InlineData("has space")]
    [InlineData("bad@name")]
    public async Task CreateUserAsync_WithInvalidUsername_ThrowsArgumentException(string username)
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.CreateUserAsync(ValidRequest(username: username)));
    }

    [Fact]
    public async Task SetPasswordAsync_WithUnknownId_ThrowsArgumentException()
    {
        _userRepository.Setup(r => r.GetByIdAsync("missing")).ReturnsAsync((User?)null);

        await Assert.ThrowsAsync<ArgumentException>(
            () => _service.SetPasswordAsync("missing", "newpass123"));

        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task SetActiveStatusAsync_DeactivatingSelf_ThrowsInvalidOperationException()
    {
        var me = new User { Id = "1", Username = "owner" };
        _userRepository.Setup(r => r.GetByIdAsync("1")).ReturnsAsync(me);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.SetActiveStatusAsync("1", isActive: false, currentUsername: "Owner"));

        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task CreateUserAsync_TrimsUsernameButPreservesCase()
    {
        // The stored spelling is whatever the admin typed; input is only trimmed.
        _userRepository.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<User>());
        _userRepository.Setup(r => r.CreateAsync(It.IsAny<User>()))
            .ReturnsAsync((User user) => user);

        var result = await _service.CreateUserAsync(ValidRequest(username: "  Manager "));

        Assert.Equal("Manager", result.Username);
    }
}