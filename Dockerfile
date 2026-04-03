# Dockerfile for Railway deployment
# Multi-stage build: Angular frontend + .NET 8 backend

# --- Build stage ---
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Install Node.js for Angular build
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && npm --version

# Stage 1: Build Angular frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --prefer-offline

COPY frontend/ ./
RUN npm run build && \
    test -d dist && test -f dist/index.html && \
    echo "Frontend build successful" || \
    (echo "Frontend build failed - dist/index.html not found" && exit 1)

# Stage 2: Build .NET backend
WORKDIR /app
COPY backend/PosSystem/PosSystem.sln ./backend/PosSystem/PosSystem.sln
COPY backend/PosSystem/PosSystem/PosSystem.csproj ./backend/PosSystem/PosSystem/PosSystem.csproj

WORKDIR /app/backend/PosSystem/PosSystem
RUN dotnet restore PosSystem.csproj

COPY backend/PosSystem/PosSystem/ ./

# Copy frontend build output to wwwroot
RUN rm -rf wwwroot && mkdir -p wwwroot && \
    cp -r /app/frontend/dist/* wwwroot/

# Publish backend
RUN dotnet publish PosSystem.csproj -c Release -o /app/out

# Ensure wwwroot is in publish output
RUN if [ ! -f /app/out/wwwroot/index.html ]; then \
        mkdir -p /app/out/wwwroot && \
        cp -r wwwroot/* /app/out/wwwroot/; \
    fi && \
    test -f /app/out/wwwroot/index.html || (echo "wwwroot missing from output" && exit 1)

# --- Runtime stage ---
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out .

EXPOSE 8080
ENTRYPOINT ["dotnet", "PosSystem.dll"]
