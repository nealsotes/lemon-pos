# Frontend Refactoring Summary

This document outlines the major refactoring changes applied to the Lemon POS frontend application to improve modularity, maintainability, and scalability.

## Overview

The application has been reorganized into a `core/`, `shared/`, and `features/` directory structure. This separates application-wide infrastructure from domain-specific functionality.

## New Directory Structure

### `src/app/core/`
Contains singleton services, guards, and interceptors that are loaded once in the root module.
-   **Guards**: `AuthGuard`, `RoleGuard`, `AdminGuard`
-   **Interceptors**: `AuthInterceptor`
-   **Services**: `AuthService`, `OfflineService`, `SettingsService`, `PwaService`

### `src/app/shared/`
Contains reusable components, directives, pipes, and models used across multiple features.
-   **Components**: `PwaInstallComponent`
-   **Models**: `User`, `UserRole`, `LoginResponse`, `ApiResponse`, `DialogData`

### `src/app/features/`
Organizes code by domain feature. Each feature contains its own components, services, and models.

#### 1. `auth/`
-   **Components**: `LoginComponent`

#### 2. `pos/` (Point of Sale)
-   **Components**: `ProductGridComponent`, `ProductCardComponent`, `ProductFiltersComponent`, `POSHeaderComponent`, `PublicMenuComponent`, `TemperatureSelectDialogComponent`
-   **Services**: `ProductService`, `IngredientService`
-   **Models**: `Product`, `Category`, `Ingredient`

#### 3. `checkout/`
-   **Components**: `CartComponent`, `CheckoutComponent`, `ReceiptComponent`, `PrinterSettingsComponent`, `QrCodeGeneratorComponent`
-   **Services**: `CartService`, `TransactionService`, `ThermalPrinterService`
-   **Models**: `CartItem`, `Transaction`, `OpenOrder`

#### 4. `inventory/`
-   **Components**: `InventoryComponent`, `StockMovementHistoryComponent`
-   **Services**: `StockMovementService`
-   **Models**: `StockMovement`

#### 5. `admin/`
-   **Components**: `ReportsComponent`, `ProductManagementComponent`, `SettingsComponent`

## Key Changes

1.  **Moved Files**: All components, services, and models were moved from flattened `src/app/components`, `src/app/services`, etc., to their respective feature or core directories.
2.  **Updated Imports**: All import paths were updated to reflect the new structure.
3.  **Environment Config**: Service imports for `environment.prod.ts` were corrected to handle the deeper directory nesting.
4.  **Standalone Components**: The application continues to use standalone components, with imports in `main.ts` and `app.component.ts` updated accordingly.

## Verification

-   **Build**: The application should build successfully with `npm run build`.
-   **Routing**: All routes in `app-routing.module.ts` have been updated.
-   **Services**: Core services are properly provided in `root` or imported in `main.ts`.

## Next Steps

-   Run the application and verify all major flows (Login, POS, Checkout, Inventory, Admin).
-   Check browser console for any runtime errors related to missing modules.
