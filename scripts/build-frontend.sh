#!/bin/bash
# Build frontend before Railpack builds backend
# This script runs in Railway's Railpack build environment

set -e

echo "=== Building Frontend ==="

# Check if we're in the right directory
if [ ! -d "frontend" ]; then
    echo "Error: frontend directory not found"
    exit 1
fi

cd frontend

# Install Node.js if not available (Railpack might have it)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Install dependencies
echo "Installing frontend dependencies..."
npm ci --no-audit

# Build frontend
echo "Building Angular frontend..."
npm run build

# Verify build
if [ ! -d "dist" ]; then
    echo "Error: Frontend build failed - dist directory not found"
    exit 1
fi

echo "✅ Frontend build successful"

# Copy to backend wwwroot
cd ..
echo "Copying frontend to backend wwwroot..."
mkdir -p backend/PosSystem/PosSystem/wwwroot
rm -rf backend/PosSystem/PosSystem/wwwroot/*
cp -r frontend/dist/* backend/PosSystem/PosSystem/wwwroot/

echo "✅ Frontend copied to wwwroot"
echo "Files in wwwroot:"
ls -la backend/PosSystem/PosSystem/wwwroot/ | head -10

# Verify v2.0 is in the built files
if grep -q "v2.0" backend/PosSystem/PosSystem/wwwroot/index.html 2>/dev/null || \
   grep -r "v2.0" backend/PosSystem/PosSystem/wwwroot/*.js 2>/dev/null | head -1; then
    echo "✅ Found 'v2.0' in built files"
else
    echo "⚠️  Warning: 'v2.0' not found in built files"
    echo "Checking index.html:"
    head -20 backend/PosSystem/PosSystem/wwwroot/index.html | grep -i "welcome" || true
fi

echo "=== Frontend build complete ==="

