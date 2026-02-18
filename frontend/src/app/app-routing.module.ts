import { Routes } from '@angular/router';
import { ProductGridComponent } from './features/pos/components/product-grid/product-grid.component';
import { ReportsComponent } from './features/admin/components/reports/reports.component';
import { ProductManagementComponent } from './features/admin/components/product-management/product-management.component';
import { CartComponent } from './features/checkout/components/cart/cart.component';
import { CheckoutComponent } from './features/checkout/components/checkout/checkout.component';
import { ReceiptComponent } from './features/checkout/components/receipt/receipt.component';
import { PrinterSettingsComponent } from './features/checkout/components/printer-settings/printer-settings.component';
import { InventoryComponent } from './features/inventory/components/inventory/inventory.component';
import { LoginComponent } from './features/auth/components/login/login.component';
import { PublicMenuComponent } from './features/pos/components/public-menu/public-menu.component';
import { SettingsComponent } from './features/admin/components/settings/settings.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { AdminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  // Public routes (no authentication required)
  { path: 'login', component: LoginComponent },
  { path: 'menu', component: PublicMenuComponent }, // Public menu - no auth required

  // Protected routes (authentication required)
  { path: 'pos', component: ProductGridComponent, canActivate: [AuthGuard] },
  { path: 'cart', component: CartComponent, canActivate: [AuthGuard] },
  { path: 'checkout', component: CheckoutComponent, canActivate: [AuthGuard] },
  { path: 'receipt', component: ReceiptComponent, canActivate: [AuthGuard] },
  { path: 'reports', component: ReportsComponent, canActivate: [AuthGuard, RoleGuard] },
  { path: 'products', component: ProductManagementComponent, canActivate: [AuthGuard, RoleGuard] },
  { path: 'inventory', component: InventoryComponent, canActivate: [AuthGuard, RoleGuard] },
  { path: 'printer-settings', component: PrinterSettingsComponent, canActivate: [AuthGuard, RoleGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard, AdminGuard] },

  // Default redirects
  { path: '', redirectTo: '/pos', pathMatch: 'full' },
  { path: '**', redirectTo: '/pos' }
];




