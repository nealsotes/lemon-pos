# DEVOPS_AGENT.md - QuickServe DevOps Specialist

## Role & Responsibilities

The DevOps Agent specializes in deployment and infrastructure for QuickServe, focusing on:
- Docker containerization and multi-stage builds
- Railway platform deployment
- Environment variable management
- Build optimization and caching
- CI/CD pipeline configuration
- Production deployment workflows
- Monitoring and logging

## Technology Stack

- **Containerization**: Docker
- **Platform**: Railway
- **Build System**: Multi-stage Docker builds
- **Frontend Build**: Angular CLI (npm)
- **Backend Build**: .NET 8 SDK
- **Web Server**: ASP.NET Core Kestrel

## Docker Configuration

### Multi-Stage Dockerfile

The Dockerfile uses a multi-stage build process:

1. **Build Stage**: .NET SDK with Node.js for building both frontend and backend
2. **Runtime Stage**: .NET ASP.NET runtime for production

### Key Dockerfile Features

```dockerfile
# Stage 1: Build Angular frontend
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Install Node.js for Angular build
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit
COPY frontend/ ./
RUN npm run build

# Stage 2: Build .NET backend
WORKDIR /app/backend/PosSystem/PosSystem
COPY backend/PosSystem/PosSystem/*.csproj ./
RUN dotnet restore
COPY backend/PosSystem/PosSystem/ ./
COPY --from=build /app/frontend/dist ./wwwroot
RUN dotnet publish -c Release -o /app/out

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out .
EXPOSE 8080
ENTRYPOINT ["dotnet", "PosSystem.dll"]
```

### Build Arguments

```dockerfile
ARG CACHE_BUST
ARG BUILD_DATE
ARG BUILD_VERSION
ARG BUILD_ID=$(date +%s%N)
```

These arguments help bust Docker cache and ensure fresh builds.

## Railway Deployment

### Railway Configuration

```toml
# railway.toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "dotnet PosSystem.dll"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### Environment Variables

Required environment variables in Railway:

```
# Database
MYSQL_URL=mysql://user:password@host:port/database
# OR individual variables:
MYSQL_HOST=hostname
MYSQL_PORT=3306
MYSQL_DATABASE=quickserve
MYSQL_USER=username
MYSQL_PASSWORD=password

# JWT Authentication
JWT__KEY=your-secret-key-here
JWT__ISSUER=QuickServe
JWT__AUDIENCE=QuickServe

# Server
PORT=8080
ASPNETCORE_URLS=http://0.0.0.0:8080
```

### Railway Build Process

1. Railway detects Dockerfile in repository root
2. Builds Docker image using multi-stage process
3. Pushes image to Railway's container registry
4. Deploys container with environment variables
5. Routes traffic to container on specified port

## Build Optimization

### Cache Busting Strategies

```dockerfile
# Use build arguments to force cache invalidation
ARG BUILD_ID=$(date +%s%N)
RUN echo "Build ID: ${BUILD_ID}" > /tmp/build-id.txt

# Remove cache directories before build
RUN rm -rf dist .angular/cache node_modules/.cache
```

### Layer Optimization

- Copy dependency files first (package.json, *.csproj)
- Install dependencies before copying source code
- This allows Docker to cache dependency layers

```dockerfile
# Good: Dependencies cached separately
COPY package*.json ./
RUN npm ci
COPY . ./

# Bad: Source changes invalidate dependency cache
COPY . ./
RUN npm ci
```

### Build Verification

```dockerfile
# Verify build outputs
RUN if [ ! -d "dist" ]; then \
        echo "ERROR: dist directory not found"; \
        exit 1; \
    fi

RUN if [ ! -f "wwwroot/index.html" ]; then \
        echo "ERROR: index.html missing"; \
        exit 1; \
    fi
```

## Deployment Workflows

### Local Docker Build

```bash
# Build Docker image
docker build -t quickserve:latest .

# Run container locally
docker run -p 8080:8080 \
  -e MYSQL_URL="mysql://user:pass@host:3306/db" \
  -e JWT__KEY="secret-key" \
  quickserve:latest

# Test locally before deploying
curl http://localhost:8080/api/products
```

### Railway Deployment

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Link project
railway link

# Deploy
railway up

# View logs
railway logs

# Check status
railway status
```

### Deployment Checklist

- [ ] Environment variables configured in Railway
- [ ] MySQL database provisioned and accessible
- [ ] JWT keys set securely
- [ ] Frontend build completes successfully
- [ ] Backend build completes successfully
- [ ] wwwroot contains frontend files
- [ ] Database migrations applied
- [ ] Application starts without errors
- [ ] Health check endpoint responds
- [ ] API endpoints accessible

## Troubleshooting

### Build Failures

```bash
# Check Docker build logs
docker build -t quickserve . 2>&1 | tee build.log

# Common issues:
# - Node.js version mismatch
# - Missing dependencies
# - Frontend build errors
# - Backend compilation errors
```

### Runtime Issues

```bash
# Check container logs
railway logs

# Common issues:
# - Database connection failures
# - Missing environment variables
# - Port binding issues
# - Missing wwwroot files
```

### Database Connection

```bash
# Test MySQL connection from Railway
railway run mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE

# Verify connection string format
echo $MYSQL_URL
```

## Environment-Specific Configurations

### Development

```bash
# Local development
cd backend/PosSystem/PosSystem
dotnet run

# Frontend development
cd frontend
npm start
```

### Production

```bash
# Railway automatically handles:
# - Docker build
# - Container deployment
# - Environment variable injection
# - Health checks
# - Auto-restart on failure
```

## Monitoring

### Health Checks

```csharp
// In Program.cs
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

// Railway automatically monitors:
// - Container health
// - HTTP response codes
// - Application logs
```

### Logging

```csharp
// Structured logging
_logger.LogInformation("Product created: {ProductId} {ProductName}", 
    product.Id, product.Name);

_logger.LogError(ex, "Failed to create product: {ProductId}", productId);
```

Railway automatically collects and displays logs in the dashboard.

## Performance Optimization

### Build Time

- Use `.dockerignore` to exclude unnecessary files
- Leverage Docker layer caching
- Use build cache for npm packages

```dockerignore
node_modules
.git
.angular
dist
bin
obj
*.md
```

### Runtime Performance

- Use production builds (minified, optimized)
- Enable response compression
- Use CDN for static assets (if applicable)

```csharp
// In Program.cs
builder.Services.AddResponseCompression();
app.UseResponseCompression();
```

## Security Best Practices

1. **Secrets Management**: Never commit secrets to repository
2. **Environment Variables**: Use Railway's secure environment variables
3. **JWT Keys**: Use strong, randomly generated keys
4. **Database Credentials**: Rotate regularly
5. **HTTPS**: Railway provides HTTPS by default
6. **CORS**: Configure appropriately for production

```csharp
// CORS configuration
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowProduction",
        policy => policy
            .WithOrigins("https://yourdomain.com")
            .AllowAnyMethod()
            .AllowAnyHeader());
});
```

## Rollback Procedures

### Railway Rollback

```bash
# View deployment history
railway deployments

# Rollback to previous deployment
railway rollback <deployment-id>
```

### Manual Rollback

1. Revert code changes in Git
2. Push to repository
3. Railway automatically rebuilds and redeploys
4. Monitor logs for successful deployment

## References

- Main project guidelines: `docs/AGENTS.md` (if exists)
- Backend development: `docs/BACKEND_AGENT.md`
- Frontend development: `docs/FRONTEND_AGENT.md`
- Railway documentation: https://docs.railway.app/
- Docker documentation: https://docs.docker.com/
