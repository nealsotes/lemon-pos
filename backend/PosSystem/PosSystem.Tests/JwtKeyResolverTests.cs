using Microsoft.Extensions.Configuration;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// RC-03 guard tests: the JWT signing key must fail FAST at startup when it is
/// missing, shorter than 32 characters, or set to the publicly-known value that used
/// to be the silent hardcoded fallback in Program.cs/AuthService.cs (the repo is
/// public, so that string is compromised by definition). These tests prove the guard
/// exists — without them a well-meaning refactor could quietly reintroduce a fallback.
/// </summary>
public class JwtKeyResolverTests
{
    private const string ValidSecret = "tests-jwt-secret-key-0123456789abcdef0123";

    private static IConfiguration Config(params (string Key, string Value)[] pairs)
    {
        var data = new Dictionary<string, string?>();
        foreach (var (key, value) in pairs)
        {
            data[key] = value;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(data!).Build();
    }

    private static JwtMaterial ResolveWithEnvCleared(Func<JwtMaterial> resolve)
    {
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", null);
            return resolve();
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", previous);
        }
    }

    [Fact]
    public void Resolve_MissingSecret_ThrowsListingTheTriedKeys()
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            ResolveWithEnvCleared(() => JwtKeyResolver.Resolve(Config())));

        // The startup error must name every place a legitimate secret could live.
        foreach (var key in JwtKeyResolver.TriedKeys)
        {
            Assert.Contains(key, exception.Message);
        }
    }

    [Fact]
    public void Resolve_TooShortSecret_Throws()
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            ResolveWithEnvCleared(() =>
                JwtKeyResolver.Resolve(Config(("Jwt:SecretKey", "too-short")))));

        Assert.Contains(JwtKeyResolver.MinimumSecretLength.ToString(), exception.Message);
    }

    [Fact]
    public void Resolve_SetToTheKnownHardcodedFallback_Throws()
    {
        // The exact string that used to be the silent fallback — a configured value
        // equal to it must be rejected, not honored.
        var exception = Assert.Throws<InvalidOperationException>(() =>
            ResolveWithEnvCleared(() =>
                JwtKeyResolver.Resolve(Config(("Jwt:SecretKey", JwtKeyResolver.KnownWeakDefault)))));

        Assert.Contains("publicly-known", exception.Message);
    }

    [Fact]
    public void Resolve_KnownHardcodedFallbackViaEnvironmentVariable_Throws()
    {
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", JwtKeyResolver.KnownWeakDefault);
            Assert.Throws<InvalidOperationException>(
                () => JwtKeyResolver.Resolve(Config()));
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", previous);
        }
    }

    [Fact]
    public void Resolve_IssuerFromConfiguration_AudienceFallsBackToDefault()
    {
        var material = ResolveWithEnvCleared(() =>
            JwtKeyResolver.Resolve(Config(
                ("Jwt:SecretKey", ValidSecret),
                ("Jwt:Issuer", "cfg-issuer"))));

        Assert.Equal("cfg-issuer", material.Issuer);
        Assert.Equal(JwtKeyResolver.DefaultAudience, material.Audience);
    }

    [Fact]
    public void Resolve_FromEnvironmentVariable_IsUsedWhenConfigurationHasNoSecret()
    {
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", ValidSecret);

            var material = JwtKeyResolver.Resolve(Config());
            Assert.Equal(ValidSecret, material.SecretKey);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", previous);
        }
    }

    [Fact]
    public void Resolve_ConfiguredSecret_WinsOverTheEnvironmentVariable()
    {
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET_KEY");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", "env-secret-0123456789abcdef0123456789");

            var material = JwtKeyResolver.Resolve(Config(("Jwt:SecretKey", ValidSecret)));
            Assert.Equal(ValidSecret, material.SecretKey);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET_KEY", previous);
        }
    }

    [Fact]
    public void Resolve_ValidConfiguration_MaterializesMaterialWithIssuerAndAudienceDefaults()
    {
        var material = ResolveWithEnvCleared(() =>
            JwtKeyResolver.Resolve(Config(("Jwt:SecretKey", ValidSecret))));

        Assert.Equal(ValidSecret, material.SecretKey);
        Assert.Equal(JwtKeyResolver.DefaultIssuer, material.Issuer);
        Assert.Equal(JwtKeyResolver.DefaultAudience, material.Audience);
    }
}