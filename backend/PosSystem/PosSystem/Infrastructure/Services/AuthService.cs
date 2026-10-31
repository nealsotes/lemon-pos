using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using PosSystem.Core.Interfaces;
using PosSystem.Core.Models;

namespace PosSystem.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience;

    public AuthService(IUserRepository userRepository, IConfiguration configuration)
    {
        _userRepository = userRepository;

        // RC-03: single source of truth for the JWT material. JwtKeyResolver fail-fasts
        // on a missing / too short / publicly-known secret instead of silently minting
        // tokens with the hardcoded fallback key that used to ship in the repo.
        var jwt = JwtKeyResolver.Resolve(configuration);

        _secretKey = jwt.SecretKey;
        _issuer = jwt.Issuer;
        _audience = jwt.Audience;
    }

    public async Task<LoginResult?> LoginAsync(string username, string password, bool rememberMe = false)
    {
        var user = await _userRepository.GetByUsernameAsync(username);
        if (user == null || !user.IsActive)
        {
            return null;
        }

        if (!VerifyPasswordHash(password, user.PasswordHash, out var passwordHashIsLegacy))
        {
            // RC-01: the legacy unsalted SHA-256 form is only ever upgraded on a
            // successful login; failed attempts must not touch the account row.
            return null;
        }

        // Update last login
        user.LastLoginAt = DateTime.UtcNow;
        if (passwordHashIsLegacy)
        {
            // RC-01 transparent rehash: rows still carrying the legacy unsalted SHA-256
            // digest upgrade to salted PBKDF2 on their next successful login.
            user.PasswordHash = HashPassword(password);
        }
        await _userRepository.UpdateAsync(user);

        // Generate token
        var token = GenerateToken(user, rememberMe);
        var expiresAt = rememberMe ? DateTime.UtcNow.AddDays(30) : DateTime.UtcNow.AddHours(24);

        return new LoginResult
        {
            Token = token,
            Username = user.Username,
            Role = user.Role,
            ExpiresAt = expiresAt
        };
    }

    public Task<bool> ValidateTokenAsync(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_secretKey);

            tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out SecurityToken validatedToken);

            return Task.FromResult(true);
        }
        catch
        {
            return Task.FromResult(false);
        }
    }

    public async Task<User?> GetUserFromTokenAsync(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var jwtToken = tokenHandler.ReadJwtToken(token);

            // LB-002: the tokens this service mints carry the short JWT claim keys — the
            // handler's outbound claim map rewrites the minted long ClaimTypes.* URIs to
            // "unique_name" / "nameid" / "role" on the wire, and ReadJwtToken surfaces the
            // raw payload keys unmodified. An external IdP's tokens, by contrast, can carry
            // the literal long URIs. The read side must resolve both forms, or legitimate
            // self-minted tokens can never resolve a user via POST /api/auth/validate.
            var username = jwtToken.Claims.FirstOrDefault(
                c => c.Type == "unique_name" || c.Type == ClaimTypes.Name)?.Value;

            if (string.IsNullOrEmpty(username))
            {
                return null;
            }

            return await _userRepository.GetByUsernameAsync(username);
        }
        catch
        {
            return null;
        }
    }

    private string GenerateToken(User user, bool rememberMe)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_secretKey);
        var expires = rememberMe ? DateTime.UtcNow.AddDays(30) : DateTime.UtcNow.AddHours(24);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires,
            Issuer = _issuer,
            Audience = _audience,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    // RC-01: storage format for password hashes. New rows use salted PBKDF2 written
    // self-describing as pbkdf2-sha512$<iterations>$<salt-b64>$<hash-b64>. The legacy
    // form (bare base64 of an unsalted SHA-256 digest, no prefix) remains verifiable
    // and is transparently upgraded on the next successful login (see LoginAsync).
    internal const string HashFormatPrefix = "pbkdf2-sha512$";
    internal const int DefaultIterations = 100_000;
    private const int SaltSizeBytes = 16;
    private const int HashSizeBytes = 64;

    /// <summary>
    /// Produces a self-describing salted hash: pbkdf2-sha512$&lt;iterations&gt;$&lt;salt-b64&gt;$&lt;hash-b64&gt;.
    /// </summary>
    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSizeBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            DefaultIterations,
            HashAlgorithmName.SHA512,
            HashSizeBytes);

        return $"{HashFormatPrefix}{DefaultIterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    /// <summary>
    /// True when the stored hash predates the salted PBKDF2 scheme (RC-01): a bare
    /// base64 unsalted SHA-256 digest carrying no format prefix.
    /// </summary>
    public static bool IsLegacyHashFormat(string? passwordHash)
    {
        return !string.IsNullOrEmpty(passwordHash)
            && !passwordHash.StartsWith(HashFormatPrefix, StringComparison.Ordinal);
    }

    private static bool VerifyPasswordHash(string password, string passwordHash, out bool passwordHashIsLegacy)
    {
        passwordHashIsLegacy = false;

        if (string.IsNullOrEmpty(passwordHash))
        {
            return false;
        }

        if (passwordHash.StartsWith(HashFormatPrefix, StringComparison.Ordinal))
        {
            return VerifyPbkdf2Hash(password, passwordHash);
        }

        // Legacy unsalted SHA-256 (pre-RC-01 rows): the base64 digest of the raw UTF-8
        // password. Compared byte-wise in constant time like the modern form.
        passwordHashIsLegacy = true;
        byte[] legacyDigest;
        try
        {
            legacyDigest = Convert.FromBase64String(passwordHash);
        }
        catch (FormatException)
        {
            return false;
        }

        var computed = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return CryptographicOperations.FixedTimeEquals(computed, legacyDigest);
    }

    private static bool VerifyPbkdf2Hash(string password, string passwordHash)
    {
        var parts = passwordHash.Split('$');
        if (parts.Length != 4
            || !int.TryParse(parts[1], out var iterations)
            || iterations < DefaultIterations)
        {
            // Malformed or below the iteration floor — never honor it.
            return false;
        }

        byte[] salt;
        byte[] expected;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expected = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }

        var candidate = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA512,
            expected.Length);

        return CryptographicOperations.FixedTimeEquals(candidate, expected);
    }
}

