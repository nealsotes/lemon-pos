using Microsoft.Extensions.Configuration;

namespace PosSystem.Infrastructure.Services;

/// <summary>JWT signing material, resolved once at startup (RC-03).</summary>
public sealed record JwtMaterial(string SecretKey, string Issuer, string Audience);

/// <summary>
/// RC-03: single source of truth for the JWT signing material. Program.cs (bearer
/// validation) and AuthService (minting/validation) both resolve through here.
///
/// A missing, too short, or publicly-known secret fails fast at startup so an
/// unconfigured deployment can never silently sign tokens with the key that used to
/// be hardcoded in the repo — anyone with repo access could forge admin tokens.
/// </summary>
public static class JwtKeyResolver
{
    public const int MinimumSecretLength = 32;
    public const string DefaultIssuer = "QuickServePOS";
    public const string DefaultAudience = "QuickServePOS";

    // The exact value that was hardcoded as the silent fallback in Program.cs and
    // AuthService.cs before RC-03 (and shipped in appsettings.json). It is public in
    // the repository, so honoring it as a configured key is worse than having none.
    public const string KnownWeakDefault = "YourSuperSecretKeyThatShouldBeAtLeast32CharactersLongForSecurity!";

    public static readonly string[] TriedKeys =
    {
        "Jwt:SecretKey", "Jwt__SecretKey", "JWT_SECRET_KEY"
    };

    public static JwtMaterial Resolve(IConfiguration configuration)
    {
        // configuration["Jwt:SecretKey"] already covers appsettings, user secrets and
        // the ASP.NET __-separated env-form names (JWT__SecretKey / Jwt__SecretKey /
        // JWT__SECRETKEY) via the standard environment-variable configuration source.
        // JWT_SECRET_KEY is kept as an explicit Railway/Oracle compatibility fallback.
        var secret = TrimOrNull(configuration["Jwt:SecretKey"])
            ?? TrimOrNull(Environment.GetEnvironmentVariable("JWT_SECRET_KEY"));

        if (secret == null)
        {
            throw new InvalidOperationException(
                "JWT signing key is not configured. Tried: " + string.Join(", ", TriedKeys) +
                ". Set Jwt:SecretKey (or the JWT_SECRET_KEY environment variable) to a fresh random value of at least " +
                MinimumSecretLength + " characters, e.g. `openssl rand -base64 48`. See docs/DEPLOYMENT.md §0.1.");
        }

        if (secret.Length < MinimumSecretLength)
        {
            throw new InvalidOperationException(
                $"JWT signing key is too short ({secret.Length} characters, minimum {MinimumSecretLength}). " +
                "Generate one with `openssl rand -base64 48` and set Jwt:SecretKey or JWT_SECRET_KEY.");
        }

        if (string.Equals(secret, KnownWeakDefault, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "JWT signing key is set to the publicly-known default that used to ship in this repo — " +
                "treat that key as compromised and generate a fresh one with `openssl rand -base64 48`.");
        }

        var issuer = TrimOrNull(configuration["Jwt:Issuer"])
            ?? TrimOrNull(Environment.GetEnvironmentVariable("JWT_ISSUER")) ?? DefaultIssuer;
        var audience = TrimOrNull(configuration["Jwt:Audience"])
            ?? TrimOrNull(Environment.GetEnvironmentVariable("JWT_AUDIENCE")) ?? DefaultAudience;

        return new JwtMaterial(secret, issuer, audience);
    }

    private static string? TrimOrNull(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}