---
name: authentication
description: Use when working on login, JWT issuance/validation, roles, authorization policies, [Authorize] attributes, password hashing, or public vs protected endpoints in the .NET backend. The canonical source for auth in this repo; `aspnet-api` links here for anything auth-related.
---

# Authentication & Authorization — JWT Bearer

TRIGGER when: touching login, tokens, roles, `[Authorize]`, authorization policies, password handling, or deciding whether an endpoint is public.

DO NOT TRIGGER when: the change is a non-auth endpoint (`aspnet-api`) or user persistence schema (`entity-framework`/`migrations`).

## Model

- **JWT Bearer** tokens, stateless. Issued by `AuthService.LoginAsync`, validated by the JWT middleware.
- **Roles:** `Owner`, `Employee`, `Admin`. Frontend attaches the token via `AuthInterceptor`.
- Token lifetime: 24h normally, 30d with "remember me".

## Token validation (Program.cs — do not weaken)

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
    ValidateIssuer = true,   ValidIssuer = jwtIssuer,
    ValidateAudience = true, ValidAudience = jwtAudience,
    ValidateLifetime = true, ClockSkew = TimeSpan.Zero
};
```

`ClockSkew = TimeSpan.Zero` means tokens expire exactly on time — keep it. `AuthService` resolves the key with the **same** fallback chain as `Program.cs`; if you change key resolution, change both.

## Authorizing endpoints

- Class default, then tighten per action:

```csharp
[Authorize(Roles = "Owner,Employee,Admin")]   // controller default
...
[Authorize(Roles = "Owner,Admin")]            // writes
[AllowAnonymous]                              // public reads
```

- Named policies exist for reuse: `OwnerOnly` (`RequireRole("Owner")`), `EmployeeOrOwner`.
- **Public endpoints** (must be `[AllowAnonymous]`): `AuthController` login, the public menu, and the product image endpoint. Everything else requires a token.

## Passwords

- Store **hash only** (`User.PasswordHash`, `IsRequired`). Never store or log plaintext.
- Reuse `AuthService`'s existing hash/verify helpers (`VerifyPassword`) — don't roll a new hashing scheme per call site. Usernames are unique (enforced by a unique index).

## Secret management (critical)

- The JWT secret comes from config/env (`Jwt:SecretKey`, `JWT_SECRET_KEY`, `JWT__SECRETKEY`, …). There is a **hardcoded dev fallback** in code.
- **Production MUST set the secret via env var** (see `railway`). Never rely on the fallback outside local dev, and never commit a real secret. Flag any code that hardcodes issuer/audience/secret for prod.

## Frontend side

Route protection (`AuthGuard`, `RoleGuard`, `AdminGuard`) and the `AuthInterceptor` live in Angular `core/` — see `angular`. Keep role names identical across both stacks.

## Related skills

- `aspnet-api` — endpoint mechanics that these attributes decorate
- `entity-framework` — `User` entity and unique username index
- `angular` — guards/interceptor that consume the token
- `railway` — where the JWT secret/issuer/audience env vars are set

## Behavior

- Never disable issuer/audience/lifetime validation or widen `ClockSkew` to "fix" an auth bug — find the real cause.
- Default new endpoints to authenticated; make something public only with a clear reason.
- If you see a real secret in code or a prod path using the fallback secret, flag it immediately.
