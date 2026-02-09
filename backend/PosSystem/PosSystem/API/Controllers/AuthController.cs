using Microsoft.AspNetCore.Mvc;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<ActionResult<LoginResult>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest(new { message = "Username and password are required" });
        }

        var result = await _authService.LoginAsync(request.Username, request.Password, request.RememberMe);

        if (result == null)
        {
            return Unauthorized(new { message = "Invalid username or password" });
        }

        return Ok(result);
    }

    [HttpPost("validate")]
    public async Task<ActionResult<ValidateResponse>> Validate([FromBody] ValidateRequest request)
    {
        if (string.IsNullOrEmpty(request.Token))
        {
            return BadRequest(new { message = "Token is required" });
        }

        var isValid = await _authService.ValidateTokenAsync(request.Token);
        if (!isValid)
        {
            return Ok(new ValidateResponse { Valid = false });
        }

        var user = await _authService.GetUserFromTokenAsync(request.Token);
        if (user == null)
        {
            return Ok(new ValidateResponse { Valid = false });
        }

        return Ok(new ValidateResponse
        {
            Valid = true,
            Username = user.Username,
            Role = user.Role
        });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        // Token invalidation is handled client-side
        // In a production system, you might want to implement token blacklisting
        return Ok(new { message = "Logged out successfully" });
    }
}

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool RememberMe { get; set; }
}

public class ValidateRequest
{
    public string Token { get; set; } = string.Empty;
}

public class ValidateResponse
{
    public bool Valid { get; set; }
    public string? Username { get; set; }
    public UserRole? Role { get; set; }
}

