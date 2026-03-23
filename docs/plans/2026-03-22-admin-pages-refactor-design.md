# Admin Pages Refactor — Shared Component Unification

**Date:** 2026-03-22
**Scope:** Product Management, Inventory, Reports
**Approach:** Page-driven (Approach B) — refactor pages one at a time, upgrading shared components as each page demands them.

---

## Problem

All 3 admin pages duplicate the same UI patterns inline:
- KPI strips (~40 lines CSS each)
- Data tables (~190 lines CSS each)
- Buttons (~60 lines CSS each)
- Form controls (~80 lines CSS each)
- Loading spinners (~30 lines HTML + 30 lines CSS each)
- Status badges, stock bars, filter bars

Only 6 of 24 shared components are used. The rest exist but are never imported.

**Estimated duplication:** ~1,200 lines of CSS, ~300 lines of HTML across the 3 pages.

---

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Scope | All 3 admin pages | Consistency across admin |
| Approach | Page-driven (B) | Incremental value, APIs shaped by real usage |
| Data table | Column config + ng-template cell renderers | Most flexible, supports custom cells (images, badges, stock bars) |
| Form components | ControlValueAccessor | Native `formControlName` support, auto validation errors |
| Refactor order | Product mgmt → Inventory → Reports | Complex → similar → different |

---

## Shared Component Changes

### Upgraded Components

#### `data-table` — Column config + cell templates

```typescript
interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  cellTemplate?: string;  // matches ng-template cellDef name
}
```

Usage:
```html
<app-data-table
  [columns]="columns"
  [data]="filteredProducts"
  [clickable]="true"
  [emptyIcon]="'📦'"
  [emptyTitle]="'No products yet'"
  [emptyMessage]="'Add your first product'"
  [emptyAction]="'Add Product'"
  (rowClick)="editProduct($event)"
  (emptyActionClick)="openAddProductDialog()">

  <ng-template cellDef="product" let-row>
    <app-image-display [src]="row.image" [size]="36" />
    <div class="product-text">
      <span>{{ row.name }}</span>
      <small>#{{ row.id.substring(0, 8) }}</small>
    </div>
  </ng-template>

  <ng-template cellDef="status" let-row>
    <app-badge [variant]="row.isActive ? 'success' : 'danger'">
      {{ row.isActive ? 'Active' : 'Inactive' }}
    </app-badge>
  </ng-template>

  <ng-template cellDef="actions" let-row>
    <app-button variant="ghost" size="sm" (click)="edit(row)">Edit</app-button>
  </ng-template>
</app-data-table>
```

Built-in: header rendering, row iteration, empty state, row click, horizontal scroll on tablet, `@media (pointer: coarse)` touch targets.

Columns without `cellTemplate` render `row[column.key]` as plain text.

#### `input` — Add ControlValueAccessor

```html
<app-input
  formControlName="name"
  label="Product Name"
  placeholder="Enter product name"
  [required]="true"
  type="text">
</app-input>
```

- Implements `ControlValueAccessor` + `Validator`
- Reads validation errors from parent `FormControl` automatically
- Default error messages mapped from validator keys (`required`, `minlength`, `min`)
- Optional `[errors]` input to override defaults
- Supports types: `text`, `number`, `email`, `password`
- Touch-friendly sizing via `@media (pointer: coarse)` baked in

#### `select` — Add ControlValueAccessor

```html
<app-select
  formControlName="category"
  label="Category"
  placeholder="Select a category"
  [options]="categoryOptions"
  [required]="true">
</app-select>
```

- Same `ControlValueAccessor` + `Validator` pattern as input
- Options: `{ value: string, label: string }[]`
- Auto validation error display

### New Components

#### `LoadingSpinner`

```html
<app-loading-spinner message="Loading products..." />
```

- Animated circle SVG + optional message
- Centered in parent container
- Replaces ~30 lines HTML + ~30 lines CSS duplicated per page

#### `StockIndicator`

```html
<app-stock-indicator
  [stock]="product.stock"
  [threshold]="product.lowQuantityThreshold"
  [maxStock]="100" />
```

- Number + colored progress bar
- Auto-calculates status (high/medium/low) from stock vs threshold
- Number color matches bar color when low/medium

#### `FilterBar`

```html
<app-filter-bar
  searchPlaceholder="Search products..."
  [sortOptions]="[
    { value: 'name', label: 'Sort by Name' },
    { value: 'price', label: 'Sort by Price' }
  ]"
  [categories]="categories"
  (searchChange)="onSearch($event)"
  (sortChange)="onSort($event)"
  (categoryChange)="onCategory($event)">
</app-filter-bar>
```

- Combines SearchInput + sort select + ChipGroup
- Stacks vertically at 768px
- Categories optional (reports doesn't use them)
- Pages handle their own filter logic

### Existing Components (used as-is)

- `kpi-strip` / `kpi-card` — already has the right API
- `badge` — replaces inline `.status-pill`
- `button` — replaces inline `.btn` classes
- `image-display` — replaces inline image/emoji rendering
- `top-bar` — already used by all pages
- `search-input` — wrapped inside new FilterBar
- `chip-group` — wrapped inside new FilterBar
- `empty-state` — used inside data-table
- `card` — replaces inline `.form-card` / `.panel`
- `toast` / `confirm-dialog` — already used

---

## Page Refactoring

### Product Management (Phase 1)

**Estimated reduction:** ~380 lines HTML → ~180 lines, ~800 lines CSS → ~150 lines

| Current Pattern | Replaced By |
|----------------|-------------|
| Inline KPI HTML (25 lines) + CSS (40 lines) | `<app-kpi-strip [kpis]="kpiItems">` |
| Inline table (60 lines) + CSS (190 lines) | `<app-data-table>` + 3 cell templates |
| Inline loading SVG (12 lines) + CSS (30 lines) | `<app-loading-spinner>` |
| Inline stock bar per row | `<app-stock-indicator>` in cell template |
| Inline search + sort + chips (20 lines) | `<app-filter-bar>` |
| Inline `.status-pill` | `<app-badge>` in cell template |
| Inline `.btn` classes + CSS (60 lines) | `<app-button>` |
| Inline form controls + error blocks (~150 lines) | `<app-input>` / `<app-select>` with formControlName |
| Inline product image display | `<app-image-display>` in cell template |

**Stays page-specific:** Image upload/emoji picker, beverage price toggle, category custom/select switch.

### Inventory (Phase 2)

Same table → `<app-data-table>`, same KPI/loading/filter/badge/button swaps. Stock indicator reused. Simpler form (fewer fields, no image upload).

### Reports (Phase 3)

KPI strip is the main swap. Loading spinner, filter bar (no categories), transaction/product tables → `<app-data-table>`. Charts stay custom. Least form usage.

---

## Cleanup After All Pages

- Delete duplicated button/form/table/KPI/loading CSS from each page
- Remove inline styles from product management HTML
- Remove orphaned shared components if confirmed unused (Section, PageContainer)
- Standardize CSS variable naming (use `--bg-surface` not `--surface-color`)
- Standardize responsive breakpoints to 768px / 640px across all pages
- `@media (pointer: coarse)` touch targets baked into shared components, removed from pages

---

## What's NOT in Scope

- POS page / checkout flow (different feature area)
- Chart components in reports (stay custom)
- Navigation components (nav-rail, bottom-tab-bar)
- PWA / offline functionality
- Backend changes
