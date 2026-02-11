# FRONTEND_AGENT.md - QuickServe Frontend Specialist

## Role & Responsibilities

The Frontend Agent specializes in Angular 20 development, focusing on:
- Standalone component architecture
- Reactive programming with RxJS
- Angular Material UI components
- PWA (Progressive Web App) features
- State management with BehaviorSubject
- HTTP interceptors and guards
- Offline support and service workers

## Technology Stack

- **Framework**: Angular 20 (standalone components)
- **UI Library**: Angular Material
- **Reactive Programming**: RxJS
- **State Management**: BehaviorSubject/Observable pattern
- **PWA**: Service Workers, Web App Manifest
- **Build Tool**: Angular CLI
- **TypeScript**: Strict mode enabled

## Project Structure

```
frontend/src/app/
├── components/              # Feature components
│   ├── cart/               # Shopping cart
│   ├── checkout/           # Checkout flow
│   ├── inventory/          # Inventory management
│   ├── login/              # Authentication
│   ├── product-grid/       # Product display
│   ├── product-management/ # Product CRUD
│   └── ...
├── services/               # Business logic and API calls
├── models/                 # TypeScript interfaces
├── guards/                 # Route guards
├── interceptors/           # HTTP interceptors
└── app.component.*         # Root component
```

## Code Patterns

### Standalone Component Pattern

```typescript
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ProductService } from '../services/product.service';
import { Product } from '../models/product.model';

@Component({
  selector: 'app-product-grid',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-grid.component.html',
  styleUrls: ['./product-grid.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductGridComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  products$ = this.productService.getProducts();

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.productService.loadProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

### Service Pattern with BehaviorSubject

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Product } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiUrl = '/api/products';
  private productsSubject = new BehaviorSubject<Product[]>([]);
  public products$ = this.productsSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(this.apiUrl).pipe(
      tap(products => this.productsSubject.next(products)),
      catchError(error => {
        console.error('Error loading products:', error);
        // Fallback to localStorage for offline support
        const cached = this.getCachedProducts();
        if (cached) {
          this.productsSubject.next(cached);
        }
        return throwError(() => error);
      })
    );
  }

  getProducts(): Observable<Product[]> {
    return this.products$;
  }

  getProductById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/${id}`);
  }

  createProduct(product: Product): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, product).pipe(
      tap(newProduct => {
        const current = this.productsSubject.value;
        this.productsSubject.next([...current, newProduct]);
      })
    );
  }

  private getCachedProducts(): Product[] | null {
    try {
      const cached = localStorage.getItem('products');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }
}
```

### Model Interface Pattern

```typescript
// models/product.model.ts
export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  hotPrice?: number;
  categoryId?: string;
  category?: Category;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  products?: Product[];
}
```

### HTTP Interceptor Pattern

```typescript
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('token');
    
    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(request);
  }
}
```

### Route Guard Pattern

```typescript
import { Injectable } from '@angular/core';
import { Router, CanActivate } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    this.router.navigate(['/login']);
    return false;
  }
}
```

### Role Guard Pattern

```typescript
import { Injectable } from '@angular/core';
import { Router, CanActivate } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: any): boolean {
    const requiredRole = route.data['role'] as string;
    const userRole = this.authService.getUserRole();

    if (this.authService.isAuthenticated() && userRole === requiredRole) {
      return true;
    }

    this.router.navigate(['/']);
    return false;
  }
}
```

## State Management

### Cart Service Example

```typescript
@Injectable({ providedIn: 'root' })
export class CartService {
  private cartItemsSubject = new BehaviorSubject<CartItem[]>([]);
  public cartItems$ = this.cartItemsSubject.asObservable();

  constructor() {
    this.loadCartFromStorage();
  }

  addToCart(product: Product, quantity: number = 1): void {
    const current = this.cartItemsSubject.value;
    const existing = current.find(item => item.product.id === product.id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      current.push({ product, quantity });
    }

    this.cartItemsSubject.next([...current]);
    this.saveCartToStorage();
  }

  removeFromCart(productId: string): void {
    const current = this.cartItemsSubject.value.filter(
      item => item.product.id !== productId
    );
    this.cartItemsSubject.next(current);
    this.saveCartToStorage();
  }

  clearCart(): void {
    this.cartItemsSubject.next([]);
    localStorage.removeItem('cart');
  }

  private loadCartFromStorage(): void {
    try {
      const cached = localStorage.getItem('cart');
      if (cached) {
        this.cartItemsSubject.next(JSON.parse(cached));
      }
    } catch (error) {
      console.error('Error loading cart from storage:', error);
    }
  }

  private saveCartToStorage(): void {
    try {
      localStorage.setItem('cart', JSON.stringify(this.cartItemsSubject.value));
    } catch (error) {
      console.error('Error saving cart to storage:', error);
    }
  }
}
```

## PWA Features

### Service Worker Configuration

```typescript
// ngsw-config.json structure
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "/*.(svg|cur|jpg|jpeg|png|apng|webp|avif|gif|otf|ttf|woff|woff2)"
        ]
      }
    }
  ],
  "dataGroups": [
    {
      "name": "api-cache",
      "urls": ["/api/**"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxSize": 100,
        "maxAge": "1h",
        "timeout": "5s"
      }
    }
  ]
}
```

### PWA Service

```typescript
@Injectable({ providedIn: 'root' })
export class PwaService {
  private promptEvent: any;

  constructor(private swUpdate: SwUpdate) {
    if (swUpdate.isEnabled) {
      swUpdate.versionUpdates.subscribe(() => {
        if (confirm('New version available. Load?')) {
          window.location.reload();
        }
      });
    }
  }

  installPwa(): void {
    if (this.promptEvent) {
      this.promptEvent.prompt();
      this.promptEvent.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        this.promptEvent = null;
      });
    }
  }
}
```

## Angular Material Integration

### Common Material Components

```typescript
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  // ...
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule
  ]
})
```

## Best Practices

1. **OnPush Change Detection**: Use `ChangeDetectionStrategy.OnPush` for better performance
2. **RxJS Unsubscription**: Always unsubscribe using `takeUntil` pattern
3. **Type Safety**: Use strict TypeScript, define interfaces for all models
4. **Error Handling**: Use `catchError` in RxJS streams, provide user-friendly messages
5. **Offline Support**: Cache data in localStorage as fallback
6. **Lazy Loading**: Use lazy-loaded routes for feature modules
7. **Component Communication**: Use services with BehaviorSubject for shared state
8. **HTTP Errors**: Handle errors gracefully, show user-friendly messages

## Common Tasks

### Adding a New Component

1. Generate component: `ng generate component components/my-component`
2. Make it standalone (if not already)
3. Define model interfaces in `models/`
4. Create service if needed in `services/`
5. Add route in `app-routing.module.ts`
6. Import necessary Angular Material modules

### Adding a New Service

1. Create file: `services/my.service.ts`
2. Use `@Injectable({ providedIn: 'root' })`
3. Implement with BehaviorSubject for state management
4. Add error handling with `catchError`
5. Add localStorage caching for offline support

### Adding a New Route Guard

1. Create guard: `ng generate guard guards/my-guard`
2. Implement `CanActivate` interface
3. Add to route configuration with `canActivate: [MyGuard]`

## Testing

### Component Testing

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductGridComponent } from './product-grid.component';
import { ProductService } from '../services/product.service';
import { of } from 'rxjs';

describe('ProductGridComponent', () => {
  let component: ProductGridComponent;
  let fixture: ComponentFixture<ProductGridComponent>;
  let mockProductService: jasmine.SpyObj<ProductService>;

  beforeEach(async () => {
    mockProductService = jasmine.createSpyObj('ProductService', ['loadProducts', 'getProducts']);
    mockProductService.getProducts.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [ProductGridComponent],
      providers: [
        { provide: ProductService, useValue: mockProductService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductGridComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

## Build Commands

```bash
# Development server
npm start

# Production build
npm run build

# Run tests
npm test

# Run specific test file
npx ng test --include='**/product.service.spec.ts'

# Build for production with service worker
ng build --configuration production
```

## Environment Configuration

```typescript
// environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: '/api'
};
```

## References

- Main project guidelines: `docs/AGENTS.md` (if exists)
- Backend API: `docs/BACKEND_AGENT.md`
- Testing: `docs/TESTING_AGENT.md`
