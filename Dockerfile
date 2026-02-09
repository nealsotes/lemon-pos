# Dockerfile for Railway deployment
# Builds frontend and backend, then serves from wwwroot

# Add build argument to bust cache - Railway should pass this, but we'll use timestamp as fallback
ARG CACHE_BUST
ARG BUILD_DATE
ARG BUILD_VERSION

# Force cache invalidation by using a unique value that changes every build
# This ensures Docker doesn't use cached layers
ARG BUILD_ID=$(date +%s%N)

# Install Node.js in .NET SDK image for frontend build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Install Node.js (required for Angular build)
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && \
    npm --version

# Stage 1: Build Angular frontend
WORKDIR /app/frontend

# Force cache bust by using BUILD_ID
RUN echo "Build ID: ${BUILD_ID:-$(date +%s%N)}" > /tmp/build-id.txt

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json ./

# Install frontend dependencies (no cache to ensure fresh install)
RUN npm ci --no-audit --prefer-offline && \
    echo "Dependencies installed at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Copy ngsw-config.json explicitly first (required for Angular build)
COPY frontend/ngsw-config.json ./

# Copy frontend source files (this invalidates cache if source changes)
# Use --chown to ensure proper permissions and force cache invalidation
COPY --chown=root:root frontend/ ./

# CRITICAL: Verify source files are correct BEFORE building
RUN echo "=== Verifying source files BEFORE build ===" && \
    echo "Current directory: $(pwd)" && \
    echo "Files in src/app/components/login/:" && \
    ls -la src/app/components/login/ || echo "Directory not found" && \
    echo "" && \
    echo "Checking login.component.html for v2.0:" && \
    if [ -f src/app/components/login/login.component.html ]; then \
        if grep -q "Welcome Back - v2.0" src/app/components/login/login.component.html; then \
            echo "✅ FOUND 'v2.0' in login component source!"; \
            echo "Line with v2.0:"; \
            grep "v2.0" src/app/components/login/login.component.html; \
        else \
            echo "❌ ERROR: 'v2.0' NOT found in login component!"; \
            echo "First 20 lines of login component:"; \
            head -20 src/app/components/login/login.component.html; \
            echo ""; \
            echo "Searching for 'Welcome':"; \
            grep -i "welcome" src/app/components/login/login.component.html || echo "No 'welcome' found"; \
            exit 1; \
        fi; \
    else \
        echo "❌ ERROR: login.component.html file not found!"; \
        echo "Looking for HTML files:"; \
        find . -name "*.html" -type f | head -10; \
        exit 1; \
    fi && \
    echo "" && \
    echo "Source files verified - proceeding with build" && \
    echo "Build started at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > .build-timestamp && \
    echo "Cache bust: ${CACHE_BUST:-$(date +%s)}" >> .build-timestamp && \
    echo "Build date: ${BUILD_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}" >> .build-timestamp && \
    cat .build-timestamp

# Verify ngsw-config.json exists before build
RUN if [ -f ngsw-config.json ]; then \
        echo "✅ ngsw-config.json found"; \
    else \
        echo "❌ ngsw-config.json NOT found"; \
        echo "Current directory: $(pwd)"; \
        echo "Files in current directory:"; \
        ls -la; \
        echo "Looking for ngsw-config.json..."; \
        find . -name "ngsw-config.json" 2>/dev/null || echo "Not found anywhere"; \
        exit 1; \
    fi

# Build Angular frontend for production (with no cache to ensure fresh build)
# Use cache busting to ensure fresh build every time
RUN echo "=== Starting Angular build ===" && \
    echo "Cache bust: ${CACHE_BUST:-unknown}" && \
    echo "Build date: ${BUILD_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}" && \
    echo "Build version: ${BUILD_VERSION:-unknown}" && \
    echo "Build timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" && \
    echo "Removing old build artifacts..." && \
    rm -rf dist .angular/cache node_modules/.cache && \
    echo "Starting npm build..." && \
    npm run build 2>&1 | tee /tmp/build.log || (echo "❌ Frontend build failed! Build log:" && cat /tmp/build.log && exit 1) && \
    echo "✅ Build completed successfully"

# Verify frontend build output exists and add version info
RUN if [ ! -d "dist" ]; then \
        echo "❌ ERROR: dist directory not found after build!"; \
        echo "Current directory: $(pwd)"; \
        echo "Files in current directory:"; \
        ls -la; \
        exit 1; \
    else \
        echo "✅ Frontend build successful - dist directory found"; \
        echo "Contents of dist:"; \
        ls -la dist | head -10; \
        BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ"); \
        BUILD_HASH=$(echo "$BUILD_TIME${CACHE_BUST:-}" | sha256sum | cut -c1-12); \
        echo "Build timestamp: $BUILD_TIME" > dist/build-info.txt; \
        echo "Build hash: $BUILD_HASH" >> dist/build-info.txt; \
        echo "Cache bust: ${CACHE_BUST:-unknown}" >> dist/build-info.txt; \
        echo "Package version: $(node -p "require('./package.json').version")" >> dist/build-info.txt; \
        echo "Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" >> dist/build-info.txt; \
        echo "✅ Build info file created:"; \
        cat dist/build-info.txt; \
        echo "Main JS file:"; \
        ls -lh dist/main.*.js 2>/dev/null | head -1 || echo "No main.js found"; \
        echo "=== Verifying built files contain v2.0 ==="; \
        if grep -q "Welcome Back - v2.0" dist/index.html 2>/dev/null || grep -r "v2.0" dist/*.js 2>/dev/null | head -1; then \
            echo "✅ Found 'v2.0' in built files"; \
        else \
            echo "⚠️  WARNING: 'v2.0' not found in built files - checking index.html:"; \
            grep -i "welcome" dist/index.html | head -3 || echo "No welcome text found"; \
        fi; \
    fi

# Stage 2: Build .NET backend
WORKDIR /app

# First, let's see what's actually in the build context
# This will help us understand the directory structure
RUN echo "=== Current directory ===" && pwd && \
    echo "=== Contents of /app ===" && ls -la /app || true && \
    echo "=== Contents of root ===" && ls -la / || true

# Copy backend files - try different approaches
# First, copy the solution file to verify backend exists in build context
COPY backend/PosSystem/PosSystem.sln ./backend/PosSystem/PosSystem.sln

# Copy project file
COPY backend/PosSystem/PosSystem/PosSystem.csproj ./backend/PosSystem/PosSystem/PosSystem.csproj

# Restore backend dependencies
WORKDIR /app/backend/PosSystem/PosSystem
RUN dotnet restore PosSystem.csproj

# Copy all remaining backend source files
COPY backend/PosSystem/PosSystem/ ./backend/PosSystem/PosSystem/

# Copy built frontend to backend wwwroot (preserve uploads if exists)
WORKDIR /app/backend/PosSystem/PosSystem

# Remove any existing wwwroot to ensure clean copy
RUN echo "=== Removing old wwwroot ===" && \
    rm -rf wwwroot && \
    mkdir -p wwwroot && \
    echo "✅ Created fresh wwwroot directory"

# Verify frontend dist exists before copying
RUN if [ ! -d /app/frontend/dist ]; then \
        echo "❌ ERROR: Frontend dist directory not found at /app/frontend/dist"; \
        echo "Checking /app/frontend:"; \
        ls -la /app/frontend || true; \
        exit 1; \
    else \
        echo "✅ Frontend dist found at /app/frontend/dist"; \
        echo "Contents of dist:"; \
        ls -la /app/frontend/dist | head -10; \
    fi

# Copy frontend files to wwwroot
RUN echo "=== Copying frontend files ===" && \
    cp -r /app/frontend/dist/* wwwroot/ && \
    echo "✅ Files copied" && \
    echo "Verifying wwwroot contents:" && \
    ls -la wwwroot | head -10 && \
    echo "File count: $(find wwwroot -type f | wc -l)" && \
    if [ ! -f wwwroot/index.html ]; then \
        echo "❌ ERROR: index.html not found in wwwroot!"; \
        echo "Files in wwwroot:"; \
        find wwwroot -type f | head -20; \
        exit 1; \
    else \
        echo "✅ index.html verified in wwwroot"; \
        echo "index.html size: $(stat -f%z wwwroot/index.html 2>/dev/null || stat -c%s wwwroot/index.html 2>/dev/null) bytes"; \
    fi

# Build and publish backend
WORKDIR /app/backend/PosSystem/PosSystem
RUN echo "=== Verifying wwwroot exists before publish ===" && \
    ls -la wwwroot | head -10 && \
    test -f wwwroot/index.html && echo "✅ index.html exists in wwwroot before publish" || echo "❌ index.html missing before publish"

RUN dotnet publish PosSystem.csproj -c Release -o /app/out

# Verify wwwroot is in publish output, and copy it if missing
RUN echo "=== Verifying wwwroot in publish output ===" && \
    if [ -d /app/out/wwwroot ]; then \
        echo "✅ wwwroot directory found in publish output"; \
        ls -la /app/out/wwwroot | head -10; \
        if [ -f /app/out/wwwroot/index.html ]; then \
            echo "✅ index.html found in publish output"; \
        else \
            echo "⚠️  WARNING: index.html NOT found in publish output, copying from source..."; \
            cp -r /app/backend/PosSystem/PosSystem/wwwroot/* /app/out/wwwroot/ || true; \
        fi; \
        echo "wwwroot file count: $(find /app/out/wwwroot -type f | wc -l)"; \
    else \
        echo "⚠️  WARNING: wwwroot directory NOT found in publish output!"; \
        echo "Copying wwwroot from source to publish output..."; \
        mkdir -p /app/out/wwwroot && \
        cp -r /app/backend/PosSystem/PosSystem/wwwroot/* /app/out/wwwroot/ && \
        echo "✅ wwwroot copied to publish output"; \
        ls -la /app/out/wwwroot | head -10; \
        if [ ! -f /app/out/wwwroot/index.html ]; then \
            echo "❌ ERROR: index.html still missing after copy!"; \
            exit 1; \
        fi; \
    fi && \
    echo "=== Final verification ===" && \
    test -d /app/out/wwwroot && test -f /app/out/wwwroot/index.html && \
    echo "✅ wwwroot verified with index.html" || \
    (echo "❌ CRITICAL: wwwroot verification failed!" && exit 1)

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Copy published files (including wwwroot)
COPY --from=build /app/out .

# Verify wwwroot exists in final image
RUN ls -la wwwroot 2>/dev/null | head -10 || echo "WARNING: wwwroot not found in final image"
RUN test -d wwwroot && echo "✅ wwwroot verified in final image" || echo "❌ wwwroot missing in final image"

# Expose port (Railway will set PORT env var)
EXPOSE 8080

# Start the application
ENTRYPOINT ["dotnet", "PosSystem.dll"]
