using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PosSystem.API.Controllers;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// RC-04 controller-side tests: the role claim is threaded into the service and an
/// UnauthorizedAccessException (Admin touching an Owner account) maps to 403.
/// </summary>
public class UsersControllerTests
{
    private readonly Mock<IUserService> _service = new();
    private readonly UsersController _controller;

    public UsersControllerTests()
    {
        _controller = new UsersController(_service.Object);
    }

    private void SignInAs(string role)
    {
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    new[] { new Claim(ClaimTypes.Role, role) }))
            }
        };
    }

    [Fact]
    public async Task SetUserPassword_AdminAgainstOwner_Returns403()
    {
        SignInAs("Admin");
        _service
            .Setup(s => s.SetPasswordAsync("owner-1", "newpass123", "Admin"))
            .ThrowsAsync(new UnauthorizedAccessException("An Admin account cannot reset or deactivate the Owner account."));

        var result = await _controller.SetUserPassword(
            "owner-1", new UpdatePasswordRequest { Password = "newpass123" });

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, status.StatusCode);
    }

    [Fact]
    public async Task SetUserStatus_AdminAgainstOwner_Returns403()
    {
        SignInAs("Admin");
        _service
            .Setup(s => s.SetActiveStatusAsync("owner-1", false, null, "Admin"))
            .ThrowsAsync(new UnauthorizedAccessException("An Admin account cannot reset or deactivate the Owner account."));

        var result = await _controller.SetUserStatus(
            "owner-1", new UpdateUserStatusRequest { IsActive = false });

        var status = Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, status.StatusCode);
    }

    [Fact]
    public async Task SetUserPassword_PassesTheRoleClaimThroughToTheService()
    {
        SignInAs("Admin");
        _service
            .Setup(s => s.SetPasswordAsync("emp-1", "newpass123", "Admin"))
            .Returns(Task.CompletedTask);

        var result = await _controller.SetUserPassword(
            "emp-1", new UpdatePasswordRequest { Password = "newpass123" });

        Assert.IsType<NoContentResult>(result);
        _service.Verify(s => s.SetPasswordAsync("emp-1", "newpass123", "Admin"), Times.Once);
    }

    [Fact]
    public async Task SetUserStatus_PassesTheRoleClaimThroughToTheService()
    {
        SignInAs("Owner");
        _service
            .Setup(s => s.SetActiveStatusAsync("emp-1", true, null, "Owner"))
            .Returns(Task.CompletedTask);

        var result = await _controller.SetUserStatus(
            "emp-1", new UpdateUserStatusRequest { IsActive = true });

        Assert.IsType<NoContentResult>(result);
        _service.Verify(s => s.SetActiveStatusAsync("emp-1", true, null, "Owner"), Times.Once);
    }
}