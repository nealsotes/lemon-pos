import { Routes } from '@angular/router';
import { ProductGridComponent } from './components/product-grid/product-grid.component';
import { ReportsComponent } from './components/reports/reports.component';
import { ProductManagementComponent } from './components/product-management/product-management.component';
import { CartComponent } from './components/cart/cart.component';
import { CheckoutComponent } from './components/checkout/checkout.component';
import { ReceiptComponent } from './components/receipt/receipt.component';
import { PrinterSettingsComponent } from './components/printer-settings/printer-settings.component';
import { InventoryComponent } from './components/inventory/inventory.component';
import { LoginComponent } from './components/login/login.component';
import { PublicMenuComponent } from './components/public-menu/public-menu.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { AdminGuard } from './guards/admin.guard';

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

