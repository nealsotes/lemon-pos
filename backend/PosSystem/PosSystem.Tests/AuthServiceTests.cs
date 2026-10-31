using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Moq;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// Contract tests for AuthService — previously only HashPassword was covered. Pins the
/// login gate (unknown user / inactive account / wrong password never touch the
/// account row), the token generation contract (24h vs the 30-day remember-me lease,
/// name/identifier/role claims), and the round trip through ValidateTokenAsync and
/// GetUserFromTokenAsync.
/// </summary>
public class AuthServiceTests
{
    private const string Secret = "tests-jwt-secret-key-0123456789abcdef0123";
    private const string Issuer = "test-issuer";
    private const string Audience = "test-audience";

    private readonly Mock<IUserRepository> _userRepository = new();
    private readonly AuthService _service;

    public AuthServiceTests()
    {
        _service = new AuthService(_userRepository.Object, NewConfiguration());
    }

    private static IConfiguration NewConfiguration()
    {
        var configuration = new Mock<IConfiguration>();
        configuration.Setup(c => c["Jwt:SecretKey"]).Returns(Secret);
        configuration.Setup(c => c["Jwt:Issuer"]).Returns(Issuer);
        configuration.Setup(c => c["Jwt:Audience"]).Returns(Audience);
        return configuration.Object;
    }

    private static User ActiveUser(string username = "owner", UserRole role = UserRole.Owner, string password = "s3cret!")
    {
        return new User
        {
            Id = "u-1",
            Username = username,
            Role = role,
            IsActive = true,
            PasswordHash = AuthService.HashPassword(password)
        };
    }

    private void StubUser(User? user, string username = "owner")
    {
        _userRepository.Setup(r => r.GetByUsernameAsync(username)).ReturnsAsync(user);
        _userRepository.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync((User u) => u);
    }

    private static string MintToken(
        DateTime? expiresUtc = null,
        Claim[]? claims = null,
        string? secret = null)
    {
        var handler = new JwtSecurityTokenHandler();
        var expires = expiresUtc ?? DateTime.UtcNow.AddMinutes(10);
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims ?? new[] { new Claim(ClaimTypes.Name, "owner") }),
            NotBefore = expiresUtc.HasValue ? expiresUtc.Value.AddMinutes(-5) : DateTime.UtcNow,
            Expires = expires,
            Issuer = Issuer,
            Audience = Audience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret ?? Secret)),
                SecurityAlgorithms.HmacSha256Signature)
        };
        return handler.WriteToken(handler.CreateToken(descriptor));
    }

    /// <summary>
    /// Forges a JWT whose payload carries a claim under its literal long type URI —
    /// the shape only an external IdP could produce, because JwtSecurityTokenHandler's
    /// outbound claim map rewrites ClaimTypes.Name into the short "unique_name" form.
    /// </summary>
    private static string ForgeTokenWithRawLongClaim(string longClaimType, string claimValue)
    {
        static string B64(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        var header = B64(Encoding.UTF8.GetBytes(@"{""alg"":""HS256"",""typ"":""JWT""}"));
        var payloadJson =
            "{\"" + longClaimType + "\":\"" + claimValue + "\"," +
            $"\"nbf\":{((DateTimeOffset)DateTime.UtcNow.AddSeconds(-2)).ToUnixTimeSeconds()}," +
            $"\"exp\":{((DateTimeOffset)DateTime.UtcNow.AddHours(1)).ToUnixTimeSeconds()}," +
            $"\"iss\":\"{Issuer}\",\"aud\":\"{Audience}\"}}";
        var payload = B64(Encoding.UTF8.GetBytes(payloadJson));
        using var hmac = new System.Security.Cryptography.HMACSHA256(Encoding.UTF8.GetBytes(Secret));
        var signature = B64(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{header}.{payload}")));
        return $"{header}.{payload}.{signature}";
    }

    [Fact]
    public async Task LoginAsync_UnknownUsername_ReturnsNullWithoutTouchingAccount()
    {
        _userRepository.Setup(r => r.GetByUsernameAsync("ghost")).ReturnsAsync((User?)null);

        var result = await _service.LoginAsync("ghost", "s3cret!");

        Assert.Null(result);
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task LoginAsync_InactiveAccount_ReturnsNullWithoutTouchingAccount()
    {
        var user = ActiveUser();
        user.IsActive = false;
        StubUser(user);

        var result = await _service.LoginAsync("owner", "s3cret!");

        // A deactivated account must not authenticate even with the right password.
        Assert.Null(result);
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task LoginAsync_WrongPassword_ReturnsNullWithoutTouchingAccount()
    {
        StubUser(ActiveUser());

        var result = await _service.LoginAsync("owner", "wrong-password");

        Assert.Null(result);
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }

    [Fact]
    public async Task LoginAsync_CorrectPassword_UpdatesLastLoginAndReturnsToken()
    {
        StubUser(ActiveUser());

        var result = await _service.LoginAsync("owner", "s3cret!");

        Assert.NotNull(result);
        Assert.Equal("owner", result!.Username);
        Assert.Equal(UserRole.Owner, result.Role);

        // The 24-hour lease for an ordinary login.
        var hoursLeft = (result.ExpiresAt - DateTime.UtcNow).TotalHours;
        Assert.InRange(hoursLeft, 23.9, 24.1);

        // LastLoginAt was stamped and the row was written back.
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Once);
        Assert.True(result.ExpiresAt > DateTime.UtcNow.AddHours(23));

        // The token carries the standard claims the authorization stack reads back.
        // NB: ReadJwtToken surfaces the RAW payload claim types (JwtPayload wrote the
        // long WS-Fed URIs through the outbound claim map, so the parsed claims are
        // keyed by the short JWT forms) — this exactly what LB-002 is about.
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(result.Token);
        Assert.Equal("owner", jwt.Claims.First(c => c.Type == "unique_name").Value);
        Assert.Equal("u-1", jwt.Claims.First(c => c.Type == "nameid").Value);
        Assert.Equal("Owner", jwt.Claims.First(c => c.Type == "role").Value);
        Assert.Equal(Issuer, jwt.Issuer);
        Assert.Equal(Audience, jwt.Audiences.Single());
    }

    [Fact]
    public async Task LoginAsync_RememberMe_ExtendsLeaseToThirtyDays()
    {
        StubUser(ActiveUser());

        var result = await _service.LoginAsync("owner", "s3cret!", rememberMe: true);

        var daysLeft = (result!.ExpiresAt - DateTime.UtcNow).TotalDays;
        Assert.InRange(daysLeft, 29.9, 30.1);
    }

    [Fact]
    public async Task ValidateTokenAsync_TokenFromLogin_IsValid()
    {
        StubUser(ActiveUser());
        var result = await _service.LoginAsync("owner", "s3cret!");

        Assert.True(await _service.ValidateTokenAsync(result!.Token));
    }

    [Fact]
    public async Task ValidateTokenAsync_TamperedToken_ReturnsFalse()
    {
        StubUser(ActiveUser());
        var result = await _service.LoginAsync("owner", "s3cret!");
        var token = result!.Token;

        // Flip one character in the payload segment: the signature no longer matches.
        var parts = token.Split('.');
        var payload = parts[1];
        var replaceAt = payload.Length / 2;
        parts[1] = payload[..replaceAt] + (payload[replaceAt] == 'Z' ? 'A' : 'Z') + payload[(replaceAt + 1)..];
        var tampered = string.Join('.', parts);
        Assert.NotEqual(token, tampered);

        Assert.False(await _service.ValidateTokenAsync(tampered));
    }

    [Fact]
    public async Task ValidateTokenAsync_Garbage_ReturnsFalse()
    {
        Assert.False(await _service.ValidateTokenAsync("not-a-jwt"));
    }

    [Fact]
    public async Task ValidateTokenAsync_ExpiredToken_ReturnsFalse()
    {
        var token = MintToken(expiresUtc: DateTime.UtcNow.AddMinutes(-5));

        // ClockSkew is zero in the service: an expired lease is expired now.
        Assert.False(await _service.ValidateTokenAsync(token));
    }

    [Fact]
    public async Task ValidateTokenAsync_TokenSignedWithDifferentSecret_ReturnsFalse()
    {
        var token = MintToken(secret: "a-different-secret-key-0123456789abcdef");

        Assert.False(await _service.ValidateTokenAsync(token));
    }

    [Fact]
    public async Task GetUserFromTokenAsync_ServiceMintedToken_ResolvesUserFromShortClaimKey()
    {
        // LB-002, fix side: a token this service mints carries the username under the
        // short "unique_name" key (the outbound claim map rewrote ClaimTypes.Name at
        // mint time — the long WS-Fed URI never survives to the wire of a self-minted
        // token). The read side resolves that short form today; previously it looked
        // only for the long URI, so every legit token failed POST /api/auth/validate
        // with {valid:false}; see docs/LEAD_BACKLOG.md LB-002.
        StubUser(ActiveUser());
        var result = await _service.LoginAsync("owner", "s3cret!");

        var user = await _service.GetUserFromTokenAsync(result!.Token);

        Assert.NotNull(user);
        Assert.Equal("owner", user!.Username);
        Assert.Equal(UserRole.Owner, user.Role);

        // The lookup now runs end to end: LoginAsync (once) and GetUserFromTokenAsync
        // (via the short claim key, now) both consult the repository — previously the
        // read side bailed out at the claim lookup and never reached it.
        _userRepository.Verify(r => r.GetByUsernameAsync("owner"), Times.Exactly(2));
    }

    [Fact]
    public async Task GetUserFromTokenAsync_TokenWithOnlyAnIdentifierClaim_ReturnsNull()
    {
        // The wire family the mint writes is the short unique_name/nameid/role, but only
        // the username claim (in either form) resolves a user: the identifier claim names
        // the user by ID, not username, so it must never stand in for one. Emitted through
        // the handler, ClaimTypes.NameIdentifier lands on the wire as "nameid".
        var token = MintToken(claims: new[] { new Claim(ClaimTypes.NameIdentifier, "u-1") });

        var user = await _service.GetUserFromTokenAsync(token);

        Assert.Null(user);
        _userRepository.Verify(r => r.GetByUsernameAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task GetUserFromTokenAsync_TokenCarryingTheLongClaimType_LoadsUserByUsername()
    {
        // The external-IdP shape: a token whose payload carries the username claim
        // under its literal long type URI satisfies the lookup as written.
        _userRepository
            .Setup(r => r.GetByUsernameAsync("external-idp-user"))
            .ReturnsAsync(ActiveUser(username: "external-idp-user"));

        var token = ForgeTokenWithRawLongClaim(ClaimTypes.Name, "external-idp-user");

        var user = await _service.GetUserFromTokenAsync(token);

        Assert.NotNull(user);
        Assert.Equal("external-idp-user", user!.Username);
    }

    [Fact]
    public async Task GetUserFromTokenAsync_TokenWithoutNameClaim_ReturnsNull()
    {
        var token = MintToken(claims: new[] { new Claim(ClaimTypes.Role, "Employee") });

        var user = await _service.GetUserFromTokenAsync(token);

        Assert.Null(user);
        _userRepository.Verify(r => r.GetByUsernameAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task GetUserFromTokenAsync_GarbageToken_ReturnsNull()
    {
        Assert.Null(await _service.GetUserFromTokenAsync("not-a-jwt"));
    }

    [Fact]
    public async Task GetUserFromTokenAsync_KnownClaimButUnknownUser_ReturnsNull()
    {
        _userRepository.Setup(r => r.GetByUsernameAsync("vanished")).ReturnsAsync((User?)null);
        var token = ForgeTokenWithRawLongClaim(ClaimTypes.Name, "vanished");

        Assert.Null(await _service.GetUserFromTokenAsync(token));
    }

    [Fact]
    public void HashPassword_UsesTheSelfDescribingPbkdf2Sha512Format()
    {
        // RC-01: the legacy bare-SHA256 pin is replaced by the salted PBKDF2 contract.
        var hash = AuthService.HashPassword("s3cret!");

        Assert.StartsWith(AuthService.HashFormatPrefix, hash);
        var parts = hash.Split('$');
        Assert.Equal(4, parts.Length);
        Assert.True(int.Parse(parts[1]) >= 100_000, "iteration count must be at least 100k");
        Assert.Equal(16, Convert.FromBase64String(parts[2]).Length);
        Assert.Equal(64, Convert.FromBase64String(parts[3]).Length);

        // A fresh random salt per call: equal passwords never share a stored hash.
        Assert.NotEqual(AuthService.HashPassword("s3cret!"), hash);
        Assert.NotEqual(AuthService.HashPassword("other"), AuthService.HashPassword("other"));
    }

    [Fact]
    public void IsLegacyHashFormat_DistinguishesTheTwoForms()
    {
        var legacy = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes("s3cret!")));

        Assert.True(AuthService.IsLegacyHashFormat(legacy));
        Assert.False(AuthService.IsLegacyHashFormat(AuthService.HashPassword("s3cret!")));
        Assert.False(AuthService.IsLegacyHashFormat(null));
        Assert.False(AuthService.IsLegacyHashFormat(""));
        // A prefixed string is "modern" regardless of its payload; verification — not
        // the prefix — decides whether it can pass (below the iteration floor it can't).
        Assert.False(AuthService.IsLegacyHashFormat("pbkdf2-sha512$junk"));
    }

    [Fact]
    public async Task LoginAsync_LegacyUnsaltedSha256Hash_VerifiesAndUpgradesToPbkdf2()
    {
        // RC-01: rows predating the hashed upgrade carry the legacy unsalted SHA-256
        // digest; a correct login must still succeed AND replace the digest in the very
        // same single write-back that stamps LastLoginAt.
        var user = ActiveUser();
        user.PasswordHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes("s3cret!")));
        StubUser(user);

        var result = await _service.LoginAsync("owner", "s3cret!");

        Assert.NotNull(result);
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Once);
        _userRepository.Verify(r => r.UpdateAsync(It.Is<User>(u =>
            u.PasswordHash.StartsWith(AuthService.HashFormatPrefix))), Times.Once);
    }

    [Fact]
    public async Task LoginAsync_LegacyUnsaltedSha256Hash_WrongPassword_ReturnsNullAndDoesNotUpgrade()
    {
        var user = ActiveUser();
        user.PasswordHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes("s3cret!")));
        StubUser(user);

        var result = await _service.LoginAsync("owner", "wrong-password");

        Assert.Null(result);
        _userRepository.Verify(r => r.UpdateAsync(It.IsAny<User>()), Times.Never);
    }
}